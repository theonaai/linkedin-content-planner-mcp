/**
 * `oidc-provider` configured as the planner's own MCP authorization server — mirrors
 * aidl-002's own mcp:agents setup (see the auth plan). Policy: single `planner:agents` scope;
 * ES256 JWT access tokens with `aud` bound to this app's own /mcp resource URL; RFC 8707
 * resource indicators enforced; PKCE S256 required; DCR enabled (management disabled); access
 * token 1h, refresh 30d rotating; interactions delegated to services/oauth/interactions.ts.
 */
import Provider, { type Configuration, type JWKS } from "oidc-provider";
import type { AuthEnv } from "../../env.js";
import { REQUIRED_MCP_SCOPE } from "../../mcp/auth.js";
import { PostgresOAuthAdapter } from "./adapter.js";
import { findAccount } from "./account-adapter.js";
import { getCookieKeys } from "./cookie-keys.js";
import { getGrantWorkspace } from "./grant-workspace.js";
import { mcpResourceIdentifier } from "./resource.js";

function parseJwks(auth: AuthEnv): JWKS {
  let parsed: JWKS;
  try {
    parsed = JSON.parse(auth.mcpOauthJwks);
  } catch (err) {
    throw new Error(`Failed to parse MCP_OAUTH_JWKS: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    throw new Error("MCP_OAUTH_JWKS must contain at least one key");
  }
  return parsed;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 60;

export function buildMcpOAuthConfiguration(auth: AuthEnv): Configuration {
  const resource = mcpResourceIdentifier(auth);
  return {
    adapter: PostgresOAuthAdapter,
    findAccount,
    jwks: parseJwks(auth),
    cookies: { keys: [...getCookieKeys(auth)] },
    clientDefaults: {
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      // Our JWKS is ES256-only — without this default, a DCR client that doesn't declare a
      // signing alg inherits RS256 and fails registration.
      id_token_signed_response_alg: "ES256",
    },
    enabledJWA: { idTokenSigningAlgValues: ["ES256"] },
    scopes: [REQUIRED_MCP_SCOPE],
    // Mint a rotating 30d refresh token whenever the client is allowed the refresh_token
    // grant, independent of scope — avoids coupling refresh issuance to an offline_access
    // scope clients would need to explicitly request.
    issueRefreshToken: (_ctx, client) => client.grantTypeAllowed("refresh_token"),
    expiresWithSession: () => false,
    routes: {
      authorization: "/oauth/authorize",
      token: "/oauth/token",
      jwks: "/oauth/jwks",
      registration: "/oauth/register",
      revocation: "/oauth/revocation",
      introspection: "/oauth/introspection",
      end_session: "/oauth/session/end",
    },
    interactions: {
      // Outside /oauth/* so the middie-mounted provider doesn't swallow these requests.
      url: (_ctx, interaction) => `/mcp-oauth/interaction/${interaction.uid}`,
    },
    // Stamp the grant's workspace into every access token so the resource server can
    // attribute tool calls without a DB round-trip per request. Absent for pre-binding
    // grants (validated again at use time — see mcp/route.ts).
    extraTokenClaims: async (_ctx, token) => {
      if (token.kind !== "AccessToken" || !token.grantId) return undefined;
      const workspaceId = await getGrantWorkspace(token.grantId);
      return workspaceId ? { workspace_id: workspaceId } : undefined;
    },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true, initialAccessToken: false, issueRegistrationAccessToken: false },
      registrationManagement: { enabled: false },
      revocation: { enabled: true },
      introspection: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        getResourceServerInfo: (_ctx, resourceIndicator) => {
          if (resourceIndicator !== resource) {
            throw new Error(`Unknown resource "${resourceIndicator}"`);
          }
          return {
            scope: REQUIRED_MCP_SCOPE,
            audience: resource,
            accessTokenFormat: "jwt",
            accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
          };
        },
        useGrantedResource: () => true,
      },
    },
    pkce: { required: () => true },
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL_SECONDS,
      AuthorizationCode: AUTHORIZATION_CODE_TTL_SECONDS,
      RefreshToken: REFRESH_TOKEN_TTL_SECONDS,
      Session: 14 * 24 * 60 * 60,
      Interaction: 15 * 60,
      Grant: REFRESH_TOKEN_TTL_SECONDS,
      // Required by oidc-provider's config validator for every known model, even ones we
      // never actually write (no device flow, no client-credentials grant, no OIDC id_token).
      IdToken: 60 * 60,
      DeviceCode: 10 * 60,
      BackchannelAuthenticationRequest: 10 * 60,
      ClientCredentials: 10 * 60,
    },
  };
}

let cached: Provider | null = null;
let cachedIssuer: string | null = null;

/** Lazy memoized provider — only initialized (and JWKS/cookie-key config validated) once auth
 * is actually enabled and the AS is first hit. */
export function getMcpOAuthProvider(auth: AuthEnv): Provider {
  if (cached && cachedIssuer === auth.appPublicBaseUrl) return cached;
  cached = new Provider(auth.appPublicBaseUrl, buildMcpOAuthConfiguration(auth));
  cachedIssuer = auth.appPublicBaseUrl;
  // Trust X-Forwarded-Proto/Host so ctx.oidc.urlFor emits external HTTPS URLs behind a proxy
  // (Railway, Cloudflare, etc.) — otherwise discovery metadata advertises http:// and strict
  // MCP hosts refuse it. Provider extends Koa, so this maps to Koa's app.proxy.
  cached.proxy = true;
  return cached;
}

/** Test-only: drop the memoized instance. */
export function _resetMcpOAuthProviderForTests(): void {
  cached = null;
  cachedIssuer = null;
}
