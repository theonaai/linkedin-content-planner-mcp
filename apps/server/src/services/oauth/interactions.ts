/**
 * Fastify handlers for the `oidc-provider` interaction flow.
 *
 * Login: instead of a local login form, bridge the planner's own session cookie (set by
 * routes/auth.ts after a Theona login) — no separate credential check needed here at all. No
 * cookie -> redirect to /api/auth/login?return_to=<this interaction>, which bounces right
 * back here once Theona login completes.
 *
 * Consent: Allow/Deny rendered as <form method="POST"> with an HMAC-signed CSRF token bound
 * to the interaction uid. Never GET — granting scope is state-changing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { memberships, workspaces } from "@linkedin-planner/db";
import type { AuthEnv } from "../../env.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../../auth/session.js";
import { getOAuthDb } from "./db.js";
import { getPrimaryCookieKey } from "./cookie-keys.js";
import { setGrantWorkspace } from "./grant-workspace.js";
import { getMcpOAuthProvider } from "./provider.js";
import { mcpResourceIdentifier } from "./resource.js";
import { consentPage, errorPage, loginRequiredPage, type ConsentWorkspaceOption } from "./templates.js";

const INTERACTION_ROUTE = "/mcp-oauth/interaction/:uid";
const INTERACTION_ALLOW_ROUTE = "/mcp-oauth/interaction/:uid/allow";
const INTERACTION_DENY_ROUTE = "/mcp-oauth/interaction/:uid/deny";
const CSRF_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

interface InteractionParams {
  uid: string;
}

function readCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name && rest.length > 0) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sendHtml(reply: FastifyReply, html: string, status = 200): void {
  reply.header("Content-Type", "text/html; charset=utf-8").status(status).send(html);
}

function signCsrfToken(auth: AuthEnv, uid: string, issuedAt: number = Date.now()): string {
  const mac = createHmac("sha256", getPrimaryCookieKey(auth)).update(`${uid}.${issuedAt}`).digest("base64url");
  return `${mac}.${issuedAt}`;
}

function verifyCsrfToken(auth: AuthEnv, uid: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const sep = token.lastIndexOf(".");
  if (sep <= 0) return false;
  const providedMac = token.slice(0, sep);
  const issuedAt = Number(token.slice(sep + 1));
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > CSRF_TOKEN_MAX_AGE_MS || issuedAt > Date.now()) return false;
  const expected = createHmac("sha256", getPrimaryCookieKey(auth)).update(`${uid}.${issuedAt}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedMac, "base64url");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function readFormField(body: unknown, field: string): string | undefined {
  if (body && typeof body === "object" && field in body) {
    const value = (body as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

async function listWorkspacesForConsent(userId: string): Promise<ConsentWorkspaceOption[]> {
  const db = getOAuthDb();
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId));
  return rows;
}

async function assertWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean> {
  const db = getOAuthDb();
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}

async function handleInteraction(
  request: FastifyRequest<{ Params: InteractionParams }>,
  reply: FastifyReply,
  auth: AuthEnv,
): Promise<void> {
  const provider = getMcpOAuthProvider(auth);
  let details;
  try {
    details = await provider.interactionDetails(request.raw, reply.raw);
  } catch {
    sendHtml(reply, errorPage("This authorization link has expired. Please start over."), 400);
    return;
  }

  const { prompt } = details;

  if (prompt.name === "login") {
    const cookie = readCookie(request, SESSION_COOKIE_NAME);
    const session = cookie ? await verifySessionToken(auth.sessionCookieSecret, cookie) : null;

    if (!session) {
      const base = auth.appPublicBaseUrl;
      const interactionUrl = `${base}/mcp-oauth/interaction/${request.params.uid}`;
      const signInUrl = `${base}/api/auth/login?return_to=${encodeURIComponent(interactionUrl)}`;
      sendHtml(reply, loginRequiredPage({ signInUrl }), 200);
      return;
    }

    try {
      await provider.interactionFinished(
        request.raw,
        reply.raw,
        { login: { accountId: session.userId } },
        { mergeWithLastSubmission: false },
      );
    } catch {
      sendHtml(reply, errorPage("Failed to complete sign-in. Please start over."), 500);
    }
    return;
  }

  if (prompt.name === "consent") {
    const clientId = typeof details.params.client_id === "string" ? details.params.client_id : "";
    const client = await provider.Client.find(clientId);
    const clientName =
      typeof client?.clientName === "string" && client.clientName ? client.clientName : clientId || "an MCP client";
    const csrfToken = signCsrfToken(auth, request.params.uid);
    const accountId = details.session?.accountId;
    const scopes = typeof details.params.scope === "string" ? details.params.scope.split(/\s+/).filter(Boolean) : [];
    const consentWorkspaces = accountId ? await listWorkspacesForConsent(accountId) : [];

    sendHtml(
      reply,
      consentPage({
        clientName,
        scopes,
        allowUrl: `/mcp-oauth/interaction/${request.params.uid}/allow`,
        denyUrl: `/mcp-oauth/interaction/${request.params.uid}/deny`,
        csrfToken,
        workspaces: consentWorkspaces,
      }),
      200,
    );
    return;
  }

  sendHtml(reply, errorPage(`Unsupported prompt: ${prompt.name}`), 400);
}

async function handleAllow(
  request: FastifyRequest<{ Params: InteractionParams }>,
  reply: FastifyReply,
  auth: AuthEnv,
): Promise<void> {
  if (!verifyCsrfToken(auth, request.params.uid, readFormField(request.body, "csrf"))) {
    sendHtml(reply, errorPage("This authorization link is invalid or has expired."), 403);
    return;
  }

  const provider = getMcpOAuthProvider(auth);
  let details;
  try {
    details = await provider.interactionDetails(request.raw, reply.raw);
  } catch {
    sendHtml(reply, errorPage("This authorization link has expired. Please start over."), 400);
    return;
  }
  if (details.prompt.name !== "consent") {
    sendHtml(reply, errorPage("Unexpected interaction state."), 400);
    return;
  }

  const accountId = details.session?.accountId;
  const clientId = typeof details.params.client_id === "string" ? details.params.client_id : "";
  if (!accountId || !clientId) {
    sendHtml(reply, errorPage("Missing account or client context."), 400);
    return;
  }

  const workspaceId = readFormField(request.body, "workspace_id");
  if (workspaceId && !(await assertWorkspaceMembership(accountId, workspaceId))) {
    sendHtml(reply, errorPage("You are not a member of the selected workspace."), 403);
    return;
  }

  try {
    const grantId = details.grantId;
    const grant = grantId ? await provider.Grant.find(grantId) : new provider.Grant({ accountId, clientId });
    if (!grant) {
      sendHtml(reply, errorPage("Failed to build grant."), 500);
      return;
    }

    const resource = mcpResourceIdentifier(auth);
    const promptDetails = details.prompt.details as {
      missingResourceScopes?: Record<string, string[]>;
      missingOIDCScope?: string[];
    };
    const scopesForResource = promptDetails.missingResourceScopes?.[resource] ?? [];
    for (const scope of scopesForResource) {
      grant.addResourceScope(resource, scope);
    }
    // The same scope name also shows up as a "regular" (non-resource-bound) requested scope
    // — since planner:agents is registered as a plain Configuration scope, not exclusively
    // inside resourceIndicators, oidc-provider tracks consent for it on both axes. Only
    // satisfying the resource-scope side left this half unresolved and the interaction
    // looped back to consent indefinitely instead of ever finishing.
    for (const scope of promptDetails.missingOIDCScope ?? []) {
      grant.addOIDCScope(scope);
    }

    const persistedGrantId = await grant.save();
    if (workspaceId) {
      await setGrantWorkspace(persistedGrantId, workspaceId);
    }

    await provider.interactionFinished(
      request.raw,
      reply.raw,
      { consent: { grantId: persistedGrantId } },
      { mergeWithLastSubmission: true },
    );
  } catch (err) {
    if (!reply.sent) {
      sendHtml(reply, errorPage("Failed to save consent."), 500);
    }
    throw err;
  }
}

async function handleDeny(
  request: FastifyRequest<{ Params: InteractionParams }>,
  reply: FastifyReply,
  auth: AuthEnv,
): Promise<void> {
  if (!verifyCsrfToken(auth, request.params.uid, readFormField(request.body, "csrf"))) {
    sendHtml(reply, errorPage("This authorization link is invalid or has expired."), 403);
    return;
  }

  const provider = getMcpOAuthProvider(auth);
  let details;
  try {
    details = await provider.interactionDetails(request.raw, reply.raw);
  } catch {
    sendHtml(reply, errorPage("This authorization link has expired. Please start over."), 400);
    return;
  }
  if (details.prompt.name !== "consent") {
    sendHtml(reply, errorPage("Unexpected interaction state."), 400);
    return;
  }

  try {
    await provider.interactionFinished(
      request.raw,
      reply.raw,
      { error: "access_denied", error_description: "The user denied the authorization request." },
      { mergeWithLastSubmission: false },
    );
  } catch (err) {
    if (!reply.sent) {
      sendHtml(reply, errorPage("Failed to record denial."), 500);
    }
    throw err;
  }
}

export function registerOAuthInteractionRoutes(fastify: FastifyInstance, auth: AuthEnv): void {
  fastify.get<{ Params: InteractionParams }>(INTERACTION_ROUTE, (request, reply) =>
    handleInteraction(request, reply, auth),
  );
  fastify.post<{ Params: InteractionParams }>(INTERACTION_ALLOW_ROUTE, (request, reply) =>
    handleAllow(request, reply, auth),
  );
  fastify.post<{ Params: InteractionParams }>(INTERACTION_DENY_ROUTE, (request, reply) =>
    handleDeny(request, reply, auth),
  );
}
