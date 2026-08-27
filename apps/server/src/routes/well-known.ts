/**
 * Public discovery documents for this deployment. Two documents, two jobs:
 *
 *  - `/.well-known/mcp.json` — the server card a registry (or a client pre-flighting a URL) reads
 *    to learn what this server is and how to reach it, without connecting first. Shaped to the
 *    MCP registry's own server.json schema, so the exact bytes we serve are also the bytes we can
 *    submit when publishing, rather than a second description that drifts from this one.
 *  - `/.well-known/oauth-protected-resource/mcp` — RFC 9728 Protected Resource Metadata, how an
 *    MCP host finds the authorization server after `/mcp` answers 401.
 *
 * Both are unauthenticated by design — they are the bootstrap documents, read before the client
 * holds any credential. Nothing needs exempting: this server has no global auth hook, the only
 * token check lives inside the `/mcp` handler itself (mcp/route.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { REQUIRED_MCP_SCOPE } from "../mcp/auth.js";
import {
  MCP_REGISTRY_NAME,
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  REPOSITORY_ID,
  REPOSITORY_URL,
} from "../mcp/identity.js";
import { mcpResourceIdentifier } from "../services/oauth/resource.js";
import type { AuthEnv, Env } from "../env.js";

export const PRM_PATH = "/.well-known/oauth-protected-resource/mcp";
export const SERVER_CARD_PATH = "/.well-known/mcp.json";

const SERVER_CARD_SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

/** 5 min: cheap enough to re-fetch, short enough that a redeploy is picked up quickly. */
const CACHE_CONTROL = "public, max-age=300";

/**
 * How a client should authenticate, in the card's vendor-extension slot. server.json has no
 * first-class field for this, and inventing a top-level one would produce a document that fails
 * the registry's own schema — `_meta` under the registry's reverse-DNS key is the sanctioned
 * place for publisher-provided extras.
 *
 * This block is a signpost, not the contract: the PRM document remains authoritative. It exists
 * so a registry listing can say "OAuth, not an API key" without a round trip.
 */
function buildAuthorizationMeta(auth: Env["auth"]): Record<string, unknown> {
  if (!auth.enabled) {
    // AUTH_ENABLED unset is the self-host/local default, where no OAuth AS is mounted at all
    // (see index.ts). Advertising one would point clients at endpoints that 404.
    return { type: "none" };
  }
  return {
    type: "oauth2",
    protected_resource_metadata: `${auth.appPublicBaseUrl}${PRM_PATH}`,
    authorization_servers: [auth.appPublicBaseUrl],
    scopes_supported: [REQUIRED_MCP_SCOPE],
    // The AS runs dynamic client registration (oidc-provider's `registration` feature), so an
    // agent can obtain a client_id unattended. Worth stating: it decides whether a registry can
    // offer one-click connect or has to send the user off to request credentials by hand.
    dynamic_client_registration: true,
  };
}

function buildServerCard(env: Env): Record<string, unknown> {
  return {
    $schema: SERVER_CARD_SCHEMA_URL,
    name: MCP_REGISTRY_NAME,
    title: MCP_SERVER_TITLE,
    description: MCP_SERVER_DESCRIPTION,
    version: MCP_SERVER_VERSION,
    websiteUrl: env.publicBaseUrl,
    repository: { url: REPOSITORY_URL, source: "github", id: REPOSITORY_ID },
    remotes: [
      {
        // Streamable HTTP only. `/mcp` is stateless (no session id, see mcp/route.ts) and GET
        // there is a deliberate 405 — there is no SSE transport to advertise.
        type: "streamable-http",
        // The same origin the PRM calls `resource` and the token check calls `aud`: all three
        // derive from APP_PUBLIC_BASE_URL, so a client that reads this card and a client that
        // reads a 401 arrive at the same URL string.
        url: `${env.publicBaseUrl}/mcp`,
      },
    ],
    _meta: {
      "io.modelcontextprotocol.registry/publisher-provided": {
        authorization: buildAuthorizationMeta(env.auth),
      },
    },
  };
}

function sendJson(reply: FastifyReply, body: unknown): void {
  reply.header("Content-Type", "application/json").header("Cache-Control", CACHE_CONTROL).status(200).send(body);
}

function registerProtectedResourceMetadata(app: FastifyInstance, auth: AuthEnv): void {
  app.get(PRM_PATH, (_request: FastifyRequest, reply: FastifyReply) => {
    sendJson(reply, {
      resource: mcpResourceIdentifier(auth),
      authorization_servers: [auth.appPublicBaseUrl],
      scopes_supported: [REQUIRED_MCP_SCOPE],
      bearer_methods_supported: ["header"],
    });
  });
}

export function registerWellKnownRoutes(app: FastifyInstance, env: Env): void {
  // Always registered: the card describes the MCP endpoint, which exists whether or not this
  // deployment fronts it with OAuth. Only the `authorization` block differs.
  app.get(SERVER_CARD_PATH, (_request: FastifyRequest, reply: FastifyReply) => {
    sendJson(reply, buildServerCard(env));
  });

  // The PRM only makes sense where the AS it names is actually mounted.
  if (env.auth.enabled) {
    registerProtectedResourceMetadata(app, env.auth);
  }
}
