import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** How long a minted ticket stays usable. Long enough for an agent to shell out and push a
 * 25 MB file over a slow link, short enough that a leaked URL isn't a standing write
 * capability on someone's post. */
export const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;

export interface UploadTicketClaims {
  postId: string;
  /** Pinned at mint time so a ticket survives only as long as the post stays in the workspace
   * the caller was authorized against — re-checked on redemption, not trusted blindly. */
  workspaceId: string;
  filename: string;
  mimeType: string;
  /** Epoch milliseconds. */
  exp: number;
}

export interface UploadTicketConfig {
  secret: string;
  /** Public origin the upload URL is built from, no trailing slash. */
  publicBaseUrl: string;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintUploadTicket(claims: UploadTicketClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export type TicketVerification =
  | { ok: true; claims: UploadTicketClaims }
  | { ok: false; reason: "malformed" | "bad signature" | "expired" };

export function verifyUploadTicket(token: string, secret: string, now = Date.now()): TicketVerification {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };

  // Signature first, payload second: nothing from the token is parsed or trusted until the
  // HMAC checks out, so a forged payload never reaches JSON.parse.
  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload, secret));
  // timingSafeEqual throws on length mismatch rather than returning false, so the lengths are
  // compared first — that comparison leaks only the length, which is fixed for a real HMAC.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad signature" };
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isClaims(claims)) return { ok: false, reason: "malformed" };
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

function isClaims(value: unknown): value is UploadTicketClaims {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.postId === "string" &&
    typeof c.workspaceId === "string" &&
    typeof c.filename === "string" &&
    typeof c.mimeType === "string" &&
    typeof c.exp === "number"
  );
}

/** The ticket rides in the query string, the way a presigned S3 URL does, so the whole
 * capability is one string an agent can hand straight to `curl -T`. It deliberately isn't a
 * path parameter: a signed ticket is far longer than Fastify's 100-character default
 * `maxParamLength`, and the router answers 414 before the handler ever runs. The trade-off is
 * that the ticket lands in access logs, which is what the short TTL is for. */
export function uploadUrlFor(token: string, publicBaseUrl: string): string {
  return `${publicBaseUrl}/api/attachments/upload?ticket=${encodeURIComponent(token)}`;
}

/** Used when ATTACHMENT_UPLOAD_SECRET isn't set: tickets then live and die with the process,
 * which is exactly right for local dev and wrong for a multi-instance deployment (a ticket
 * minted by one instance won't verify on another). */
export function generateUploadSecret(): string {
  return randomBytes(32).toString("hex");
}
