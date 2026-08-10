import { randomBytes, createHash } from "node:crypto";

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** RFC 7636 S256 PKCE pair for the outbound "Sign in with Theona" authorize request. */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** CSRF-protection value round-tripped through the authorize redirect. */
export function generateState(): string {
  return base64url(randomBytes(16));
}
