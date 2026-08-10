import type { AuthEnv } from "../../env.js";

/** oidc-provider's own interaction/session cookie signing keys (MCP_OAUTH_COOKIE_KEYS) —
 * separate from the planner's own session cookie secret in auth/session.ts. */
export function getCookieKeys(auth: AuthEnv): readonly string[] {
  return auth.mcpOauthCookieKeys;
}

export function getPrimaryCookieKey(auth: AuthEnv): string {
  return auth.mcpOauthCookieKeys[0]!;
}
