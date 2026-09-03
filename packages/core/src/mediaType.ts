/**
 * What an attachment actually is, decided by its bytes rather than by the MIME type whoever
 * uploaded it happened to send.
 *
 * Two reasons the declared type is not good enough. It is often simply wrong: `curl -F` sends
 * `application/octet-stream` for an mp4, and the MCP tools take whatever string the agent
 * passes. And it is attacker-controlled, so a preview route that trusts it would happily serve
 * an HTML document as `image/png` from the app's own origin. Sniffing the leading bytes fixes
 * both: the preview is served with the type we verified, and anything unrecognised is refused.
 */

export type PreviewKind = "image" | "video" | "pdf";

export interface DetectedMediaType {
  mimeType: string;
  kind: PreviewKind;
}

/** Enough bytes for every signature below, including the mp4 box header at offset 4. */
export const MEDIA_TYPE_SNIFF_BYTES = 32;

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/**
 * Deliberately narrow. SVG is a notable absence: it is an image everywhere else in the product,
 * but it is also a document that can carry script, and serving one inline from this origin
 * would hand that script the session cookie. SVG attachments stay downloadable, never previewed.
 */
export function detectMediaType(head: Buffer): DetectedMediaType | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", kind: "image" };
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", kind: "image" };
  }
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) {
    return { mimeType: "image/gif", kind: "image" };
  }
  // RIFF....WEBP
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: "image/webp", kind: "image" };
  }
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) {
    return { mimeType: "application/pdf", kind: "pdf" };
  }
  // ISO base media (mp4, m4v, mov): a "ftyp" box at offset 4, then a brand. QuickTime files
  // are served as video/mp4 too — every browser that plays one accepts that type, and keeping
  // a single video type keeps the whitelist to exactly what has been verified.
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { mimeType: "video/mp4", kind: "video" };
  }
  return null;
}
