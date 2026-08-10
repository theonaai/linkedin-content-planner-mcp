// Mirrors packages/core/src/limits.ts — the web app doesn't depend on core (it only talks
// REST), so these are duplicated for maxLength/hint purposes. The server enforces the real
// limit regardless; this is just fail-fast UX.
export const MAX_CONTENT_LENGTH = 100_000;
export const MAX_COMMENT_BODY_LENGTH = 10_000;
export const MAX_REVIEW_BODY_LENGTH = 10_000;
export const MAX_WEBHOOK_URL_LENGTH = 2048;
export const MAX_WEBHOOK_SECRET_LENGTH = 256;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
