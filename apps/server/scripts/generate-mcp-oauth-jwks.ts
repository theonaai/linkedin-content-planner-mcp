/**
 * Dev helper: generate a single-key JWK Set for MCP_OAUTH_JWKS — the key the planner's own
 * MCP OAuth AS signs access tokens with (separate from SESSION_COOKIE_SECRET and
 * MCP_OAUTH_COOKIE_KEYS, which are for cookies, not tokens).
 *
 *   MCP_OAUTH_JWKS=$(npx tsx scripts/generate-mcp-oauth-jwks.ts)
 *
 * Rotate by generating a new key, prepending it to the existing `keys` array, and
 * redeploying; retire the old key after the access-token TTL window (~1h).
 */
import { exportJWK, generateKeyPair } from "jose";
import { randomUUID } from "node:crypto";

async function main(): Promise<void> {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = `planner-${randomUUID()}`;
  jwk.alg = "ES256";
  jwk.use = "sig";
  console.log(JSON.stringify({ keys: [jwk] }));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
