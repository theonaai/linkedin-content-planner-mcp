import type { FastifyInstance } from "fastify";
import type { CoreServices } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { generatePkcePair, generateState } from "../auth/pkce.js";
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../auth/session.js";

const FLOW_COOKIE_NAME = "theona_oauth_flow";
/** Short-lived — only needs to survive the redirect round trip to aidl-002 and back. */
const FLOW_COOKIE_TTL_SECONDS = 5 * 60;
const IDENTITY_SCOPE = "identity";

interface FlowCookiePayload {
  verifier: string;
  state: string;
  /** Where to send the browser after login completes — set when this flow was triggered by
   * the MCP OAuth AS's login interaction bouncing here (see services/oauth/interactions.ts),
   * so the user lands back on the consent screen instead of the app root. Must be same-origin
   * (validated below) — an unchecked redirect target here would be an open-redirect vector. */
  returnTo?: string;
}

interface TheonaTokenResponse {
  access_token: string;
}

interface TheonaUserinfo {
  sub: string;
  email?: string;
}

/** "Sign in with Theona" — the planner acts as an OAuth *client* to aidl-002's existing
 * authorization server, requesting only the `identity` scope (see the aidl-002-side plan doc):
 * no MCP privileges, just enough to know who's signing in. Everything downstream (session,
 * workspace membership) is entirely the planner's own — aidl-002 is never touched again once
 * this exchange completes. */
export function registerAuthRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv) {
  app.get("/api/auth/login", async (request, reply) => {
    const { verifier, challenge } = generatePkcePair();
    const state = generateState();

    const query = request.query as { return_to?: string };
    const returnTo =
      query.return_to && query.return_to.startsWith(auth.appPublicBaseUrl) ? query.return_to : undefined;

    const flow: FlowCookiePayload = { verifier, state, returnTo };
    reply.setCookie(FLOW_COOKIE_NAME, JSON.stringify(flow), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: FLOW_COOKIE_TTL_SECONDS,
    });

    const authorizeUrl = new URL("/oauth/authorize", `${auth.theonaIssuer}/`);
    authorizeUrl.searchParams.set("client_id", auth.theonaClientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", IDENTITY_SCOPE);
    authorizeUrl.searchParams.set("redirect_uri", `${auth.appPublicBaseUrl}/api/auth/callback`);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return reply.redirect(authorizeUrl.toString());
  });

  app.get("/api/auth/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    const flowCookieRaw = request.cookies[FLOW_COOKIE_NAME];
    reply.clearCookie(FLOW_COOKIE_NAME, { path: "/api/auth" });

    if (query.error) {
      return reply.code(400).send({ error: `Theona login failed: ${query.error_description ?? query.error}` });
    }
    if (!query.code || !query.state || !flowCookieRaw) {
      return reply.code(400).send({ error: "Missing or expired OAuth callback parameters" });
    }

    let flow: FlowCookiePayload;
    try {
      flow = JSON.parse(flowCookieRaw);
    } catch {
      return reply.code(400).send({ error: "Invalid OAuth flow cookie" });
    }
    if (flow.state !== query.state) {
      return reply.code(400).send({ error: "OAuth state mismatch" });
    }

    const tokenRes = await fetch(new URL("/oauth/token", `${auth.theonaIssuer}/`), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: query.code,
        redirect_uri: `${auth.appPublicBaseUrl}/api/auth/callback`,
        client_id: auth.theonaClientId,
        code_verifier: flow.verifier,
      }),
    });
    if (!tokenRes.ok) {
      request.log.error({ status: tokenRes.status, body: await tokenRes.text() }, "Theona token exchange failed");
      return reply.code(502).send({ error: "Failed to exchange code with Theona" });
    }
    const tokens = (await tokenRes.json()) as TheonaTokenResponse;

    const userinfoRes = await fetch(new URL("/oauth/userinfo", `${auth.theonaIssuer}/`), {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoRes.ok) {
      request.log.error({ status: userinfoRes.status }, "Theona userinfo fetch failed");
      return reply.code(502).send({ error: "Failed to fetch Theona userinfo" });
    }
    const userinfo = (await userinfoRes.json()) as TheonaUserinfo;
    if (!userinfo.sub || !userinfo.email) {
      return reply.code(502).send({ error: "Theona userinfo response is missing sub/email" });
    }

    const user = await core.users.findOrCreateUser({ theonaUserId: userinfo.sub, email: userinfo.email });

    const sessionToken = await createSessionToken(auth.sessionCookieSecret, { userId: user.id });
    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return reply.redirect(flow.returnTo ?? auth.appPublicBaseUrl);
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token ? await verifySessionToken(auth.sessionCookieSecret, token) : null;
    if (!session) return reply.code(401).send({ error: "Not signed in" });

    const memberships = await core.users.listMemberships(session.userId);
    return { userId: session.userId, memberships };
  });
}
