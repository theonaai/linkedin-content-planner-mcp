/**
 * MCP resource-server auth: verifies bearer access tokens minted by the planner's own OAuth
 * AS (services/oauth/*). Per RFC 6750 + 9068 + 8707: Bearer scheme, JWS signature against the
 * AS's own JWKS, `iss`, `aud`, `exp`/`nbf`, and the required scope.
 *
 * Returns a discriminated union — `ok` (authenticated context), `unauthenticated` (transport
 * emits 401 + WWW-Authenticate pointing at the PRM doc), or `forbidden` (403, missing scope).
 */
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import type { AuthEnv } from "../env.js";
import { mcpResourceIdentifier } from "../services/oauth/resource.js";

/** Single coarse scope every MCP tool-call requires (v1) — mirrors aidl-002's mcp:agents. */
export const REQUIRED_MCP_SCOPE = "planner:agents";

export interface McpRequestContext {
  userId: string;
  clientId: string | null;
  workspaceId: string | null;
  scopes: string[];
}

export type TokenValidationFailure =
  | { kind: "unauthenticated"; reason: string }
  | { kind: "forbidden"; reason: string; requiredScope: string };

export type TokenValidationResult = { kind: "ok"; context: McpRequestContext } | TokenValidationFailure;

let jwksFetcher: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer: string | null = null;

function getJwks(auth: AuthEnv): ReturnType<typeof createRemoteJWKSet> {
  // Re-derive if the issuer ever changes (e.g. between test runs pointed at different configs).
  if (jwksFetcher && jwksIssuer === auth.theonaIssuer) return jwksFetcher;
  const jwksUrl = new URL("/oauth/jwks", `${auth.appPublicBaseUrl}/`);
  jwksFetcher = createRemoteJWKSet(jwksUrl);
  jwksIssuer = auth.theonaIssuer;
  return jwksFetcher;
}

function parseBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

function extractScopes(scope: unknown): string[] {
  if (typeof scope === "string") return scope.split(/\s+/).filter(Boolean);
  if (Array.isArray(scope)) return scope.filter((s): s is string => typeof s === "string");
  return [];
}

function formatJoseError(err: unknown): string {
  if (err instanceof joseErrors.JWTExpired) return "Access token has expired";
  if (err instanceof joseErrors.JWTClaimValidationFailed) return `Access token claim validation failed: ${err.claim}`;
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) return "Access token signature verification failed";
  if (err instanceof joseErrors.JOSEError) return `Access token is invalid: ${err.code ?? err.message}`;
  return "Access token validation failed";
}

export async function validateBearerAccessToken(
  authHeader: string | undefined,
  auth: AuthEnv,
): Promise<TokenValidationResult> {
  const token = parseBearer(authHeader);
  if (!token) return { kind: "unauthenticated", reason: "Missing or malformed Authorization header" };

  const issuer = auth.appPublicBaseUrl;
  const audience = mcpResourceIdentifier(auth);

  let payload;
  try {
    // Pinned to ES256 — the only algorithm our JWKS can produce (provider.ts's
    // enabledJWA.idTokenSigningAlgValues). Accepting a wider set here is a latent
    // algorithm-confusion vector if the JWKS ever gains an RSA key.
    const result = await jwtVerify(token, getJwks(auth), { issuer, audience, algorithms: ["ES256"] });
    payload = result.payload;
  } catch (err) {
    return { kind: "unauthenticated", reason: formatJoseError(err) };
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    return { kind: "unauthenticated", reason: "Access token is missing the `sub` claim" };
  }

  const scopes = extractScopes(payload.scope);
  if (!scopes.includes(REQUIRED_MCP_SCOPE)) {
    return {
      kind: "forbidden",
      reason: `Access token is missing the "${REQUIRED_MCP_SCOPE}" scope`,
      requiredScope: REQUIRED_MCP_SCOPE,
    };
  }

  const clientId = typeof payload.client_id === "string" ? payload.client_id : null;
  const workspaceId = typeof payload.workspace_id === "string" && payload.workspace_id ? payload.workspace_id : null;

  return { kind: "ok", context: { userId: payload.sub, clientId, workspaceId, scopes } };
}

/** Test-only: drop the cached JWKS fetcher. */
export function _resetMcpAuthForTests(): void {
  jwksFetcher = null;
  jwksIssuer = null;
}
