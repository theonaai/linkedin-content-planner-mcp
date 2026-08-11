/**
 * One-time helper: registers this app as an OAuth client against aidl-002's Dynamic Client
 * Registration endpoint (open/unauthenticated — see the linkedin-planner auth plan) and prints
 * the resulting client_id to set as THEONA_CLIENT_ID.
 *
 * Run once per environment (a fresh DCR call mints a NEW client every time — this is
 * deliberately NOT run automatically on every server boot, which would spam aidl-002 with
 * throwaway client registrations):
 *
 *   THEONA_OAUTH_ISSUER=https://ona-backend-dev.up.railway.app \
 *   APP_PUBLIC_BASE_URL=https://your-planner-deployment.example.com \
 *   npx tsx scripts/register-theona-client.ts
 */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const issuer = requiredEnv("THEONA_OAUTH_ISSUER").replace(/\/+$/, "");
  const appPublicBaseUrl = requiredEnv("APP_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const redirectUri = `${appPublicBaseUrl}/api/auth/callback`;

  const res = await fetch(new URL("/oauth/register", `${issuer}/`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "LinkedIn Content Planner",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      // aidl-002's oidc-provider gates /oauth/userinfo on the standard `openid` scope at the
      // library level — `identity` alone mints a token that gets 403 there. Must register
      // (and later request) both together. See aidl-002 PR #1885 review.
      scope: "openid identity",
    }),
  });

  if (!res.ok) {
    console.error(`Registration failed: HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }

  const client = (await res.json()) as { client_id: string; client_secret?: string };
  console.log("Registered OAuth client with aidl-002:");
  console.log(`  redirect_uri: ${redirectUri}`);
  console.log(`  THEONA_CLIENT_ID=${client.client_id}`);
  if (client.client_secret) {
    // Not expected for a `token_endpoint_auth_method: none` public client, but surface it
    // rather than silently dropping it if aidl-002's defaults ever change.
    console.log(`  (unexpected) client_secret: ${client.client_secret}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
