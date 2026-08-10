import type { AuthEnv } from "../../env.js";

/** The canonical RFC 8707 resource identifier for this app's /mcp endpoint — the value both
 * the AS (provider.ts) and the resource server (mcp/auth.ts) must agree on for `aud` checks
 * to mean anything. */
export function mcpResourceIdentifier(auth: AuthEnv): string {
  return `${auth.appPublicBaseUrl}/mcp`;
}
