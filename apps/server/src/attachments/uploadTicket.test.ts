import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mintUploadTicket, verifyUploadTicket, UPLOAD_TICKET_TTL_MS, type UploadTicketClaims } from "./uploadTicket.js";

const SECRET = "test-secret";

function claims(overrides: Partial<UploadTicketClaims> = {}): UploadTicketClaims {
  return {
    postId: randomUUID(),
    workspaceId: randomUUID(),
    filename: "carousel.pdf",
    mimeType: "application/pdf",
    exp: Date.now() + UPLOAD_TICKET_TTL_MS,
    ...overrides,
  };
}

describe("upload tickets", () => {
  it("round-trips the claims it was minted with", () => {
    const original = claims();
    const result = verifyUploadTicket(mintUploadTicket(original, SECRET), SECRET);
    expect(result).toEqual({ ok: true, claims: original });
  });

  it("rejects a ticket signed with a different secret", () => {
    const token = mintUploadTicket(claims(), "other-secret");
    expect(verifyUploadTicket(token, SECRET)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a tampered payload, so the postId can't be swapped after minting", () => {
    const token = mintUploadTicket(claims(), SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify(claims({ filename: "evil.pdf" }))).toString("base64url");
    expect(verifyUploadTicket(`${forged}.${signature}`, SECRET)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects an expired ticket", () => {
    const token = mintUploadTicket(claims({ exp: Date.now() - 1 }), SECRET);
    expect(verifyUploadTicket(token, SECRET)).toEqual({ ok: false, reason: "expired" });
  });

  it("treats the TTL boundary as expired rather than valid", () => {
    const exp = Date.now() + 1000;
    const token = mintUploadTicket(claims({ exp }), SECRET);
    expect(verifyUploadTicket(token, SECRET, exp)).toEqual({ ok: false, reason: "expired" });
    expect(verifyUploadTicket(token, SECRET, exp - 1).ok).toBe(true);
  });

  it.each(["", ".", "no-dot", "onlypayload.", ".onlysignature"])("rejects malformed token %o", (token) => {
    expect(verifyUploadTicket(token, SECRET).ok).toBe(false);
  });

  it("rejects a correctly signed payload that isn't a claims object", () => {
    // Signed with the real secret, so only the shape check stands between this and acceptance.
    const token = mintUploadTicket({ postId: 42 } as unknown as UploadTicketClaims, SECRET);
    expect(verifyUploadTicket(token, SECRET)).toEqual({ ok: false, reason: "malformed" });
  });
});
