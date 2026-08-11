/**
 * Fastify plugin mounting the planner's own MCP OAuth authorization server.
 *
 * `oidc-provider` extends Koa and reads the raw request body itself. Fastify's JSON parser
 * would consume the stream first, so `provider.callback()` is installed through
 * `@fastify/middie` (an onRequest-level hook that runs before Fastify's body parser).
 * Interaction routes stay as native Fastify routes since they need params + HTML responses.
 */
import middie from "@fastify/middie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { AuthEnv } from "../env.js";
import { getMcpOAuthProvider } from "../services/oauth/provider.js";
import { registerOAuthInteractionRoutes } from "../services/oauth/interactions.js";

export async function registerOAuthRoutes(app: FastifyInstance, auth: AuthEnv): Promise<void> {
  // Consent POSTs are form-urlencoded — Fastify only parses JSON/text by default, and no
  // other route in this app expects this content type inbound.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      const params = new URLSearchParams(typeof body === "string" ? body : body.toString());
      const result: Record<string, string> = {};
      for (const [key, value] of params) result[key] = value;
      done(null, result);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
    }
  });

  // Registered before middie so Fastify's router resolves these first — middie never sees
  // these paths.
  registerOAuthInteractionRoutes(app, auth);

  // /oauth/register and /oauth/token are handled entirely by oidc-provider's Koa middleware
  // below, not by declared Fastify routes — so Fastify's normal per-route rate-limit config
  // can't reach them. @fastify/rate-limit's global mode installs via onRoute, which also
  // never fires for these URLs, so the limiters are built here and applied manually in an
  // onRequest hook registered before middie (see below).
  //
  // - /oauth/register (DCR) is unauthenticated and creates a persistent client row with no
  //   TTL — kept tight (10/min/IP) against table-spam DoS.
  // - /oauth/token is unauthenticated (PKCE-only public clients) and handles both the
  //   authorization-code exchange and refresh rotation. A legitimate client hits it a few
  //   times per flow and roughly once an hour after — 60/min is generous for honest traffic
  //   while throttling credential stuffing / refresh-token grinding.
  await app.register(rateLimit, { global: false });
  const dcrRateLimit = app.rateLimit({ max: 10, timeWindow: "1 minute" });
  const tokenRateLimit = app.rateLimit({ max: 60, timeWindow: "1 minute" });
  app.addHook("onRequest", async function oauthRateLimitHook(req, reply) {
    if (req.method !== "POST") return;
    const url = req.url;
    if (url === "/oauth/register" || url.startsWith("/oauth/register?")) {
      await dcrRateLimit.call(this, req, reply);
      return;
    }
    if (url === "/oauth/token" || url.startsWith("/oauth/token?")) {
      await tokenRateLimit.call(this, req, reply);
    }
  });

  await app.register(middie);

  const provider = getMcpOAuthProvider(auth);
  const providerMiddleware = provider.callback() as (
    req: Parameters<Parameters<FastifyInstance["use"]>[1]>[0],
    res: Parameters<Parameters<FastifyInstance["use"]>[1]>[1],
    next: () => void,
  ) => void;

  // Gate the provider middleware to OAuth URLs ourselves — fastify.use('/oauth', mw) strips
  // the prefix (oidc-provider would see /register instead of /oauth/register and 404
  // internally), and a bare global fastify.use(mw) breaks every non-oauth route (Koa 404s on
  // unmatched paths instead of calling next()).
  app.use((req, res, next) => {
    const url = req.url ?? "";
    const isOAuth =
      url === "/oauth" ||
      url.startsWith("/oauth/") ||
      url.startsWith("/oauth?") ||
      url === "/.well-known/openid-configuration" ||
      url.startsWith("/.well-known/openid-configuration?") ||
      url === "/.well-known/oauth-authorization-server" ||
      url.startsWith("/.well-known/oauth-authorization-server?");
    if (!isOAuth) {
      next();
      return;
    }
    providerMiddleware(req, res, next);
  });
}
