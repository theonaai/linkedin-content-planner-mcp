// Central place for size limits enforced across REST, MCP, and the attachment service —
// keeping them here (rather than duplicated per input schema) means the multipart upload
// cap, the MCP base64 cap, and the storage-layer cap can never drift out of sync.

export const MAX_CONTENT_LENGTH = 100_000; // post/article body, in characters
export const MAX_STR_REPLACE_LENGTH = 100_000; // oldStr/newStr, bounded like content itself
export const MAX_COMMENT_BODY_LENGTH = 10_000;
export const MAX_REVIEW_BODY_LENGTH = 10_000;
export const MAX_WEBHOOK_URL_LENGTH = 2048;
export const MAX_WEBHOOK_SECRET_LENGTH = 256;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Total attachment storage a single workspace may accumulate across all its posts, not just
// one upload — prevents unbounded growth from many small (individually-under-the-cap) files.
export const MAX_WORKSPACE_ATTACHMENT_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_FILENAME_LENGTH = 255;
export const MAX_MIME_TYPE_LENGTH = 128; // matches the DB column's varchar(128)

// Base64 inflates size by ~4/3 — cap the encoded string length so an oversized MCP
// attach_file payload (which skips Fastify's multipart limit entirely) is rejected by the
// input schema before it's ever decoded into a Buffer.
export const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;

// The MCP endpoint carries attach_file's base64 payload as plain JSON, not multipart — so
// it's bound by Fastify's own server-wide bodyLimit (1 MiB by default), not the multipart
// plugin's fileSize option. That default would reject a legitimate max-size attachment
// before our schema check ever runs, so the server's bodyLimit must be raised to fit the
// largest allowed base64 payload plus room for the JSON-RPC envelope.
export const MAX_HTTP_BODY_BYTES = MAX_ATTACHMENT_BASE64_LENGTH + 64 * 1024;
