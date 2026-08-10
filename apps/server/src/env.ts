export interface AuthEnv {
  enabled: true;
  /** aidl-002's OAuth AS, no trailing slash. */
  theonaIssuer: string;
  /** This app's own public origin, no trailing slash — used to build the OAuth redirect_uri. */
  appPublicBaseUrl: string;
  /** Signs the local session cookie issued after a successful Theona login. */
  sessionCookieSecret: string;
  /** Registered once via scripts/register-theona-client.ts (aidl-002's DCR is a public,
   * no-secret client — see that script for why this isn't done automatically on every boot). */
  theonaClientId: string;
  /** JSON-encoded JWK Set (ES256) the planner's own MCP OAuth AS signs access tokens with —
   * generate via scripts/generate-mcp-oauth-jwks.ts. Distinct from sessionCookieSecret: this
   * signs tokens agents present to /mcp, not the browser's session cookie. */
  mcpOauthJwks: string;
  /** Comma-separated signing keys for oidc-provider's own internal interaction/session
   * cookies (separate from the planner's own session cookie above — this is purely internal
   * state for the OAuth dance itself). First entry is current; extras rotate out old cookies. */
  mcpOauthCookieKeys: string[];
}

export interface Env {
  port: number;
  databaseUrl: string;
  attachmentsDir: string;
  /** Local dev defaults to no auth at all — every request uses the single implicit workspace,
   * exactly as before this feature existed. Only the cloud deployment sets AUTH_ENABLED=true. */
  auth: AuthEnv | { enabled: false };
}

function loadAuthEnv(): AuthEnv | { enabled: false } {
  if (process.env.AUTH_ENABLED !== "true") {
    return { enabled: false };
  }

  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required when AUTH_ENABLED=true`);
    return value;
  };

  const cookieKeys = required("MCP_OAUTH_COOKIE_KEYS")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (cookieKeys.length === 0) {
    throw new Error("MCP_OAUTH_COOKIE_KEYS must contain at least one key");
  }

  return {
    enabled: true,
    theonaIssuer: required("THEONA_OAUTH_ISSUER").replace(/\/+$/, ""),
    appPublicBaseUrl: required("APP_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    sessionCookieSecret: required("SESSION_COOKIE_SECRET"),
    theonaClientId: required("THEONA_CLIENT_ID"),
    mcpOauthJwks: required("MCP_OAUTH_JWKS"),
    mcpOauthCookieKeys: cookieKeys,
  };
}

export function loadEnv(): Env {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return {
    port: Number(process.env.PORT ?? 3210),
    databaseUrl,
    attachmentsDir: process.env.ATTACHMENTS_DIR ?? "./data/attachments",
    auth: loadAuthEnv(),
  };
}
