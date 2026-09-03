import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { type CoreServices, MAX_ATTACHMENT_BYTES } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";
import { verifyUploadTicket } from "../attachments/uploadTicket.js";

/** Per-IP ceiling on upload attempts. See the route config below for the reasoning. */
export const UPLOAD_RATE_LIMIT_PER_MINUTE = 30;

/**
 * A single `bytes=` range, which is all a media element ever asks for. Multipart ranges are
 * legal HTTP and no browser sends them for `<video>`, so they are treated as no range at all
 * and answered with the whole file, which is a valid response to any range request.
 *
 * Returns "invalid" only for a range that cannot be satisfied (start past the end), which owes
 * the caller a 416 rather than a silent full body.
 */
export function parseRangeHeader(
  header: string | undefined,
  sizeBytes: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // "bytes=-500" means the last 500 bytes, not "up to byte 500".
  if (rawStart === "") {
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0) return "invalid";
    return { start: Math.max(0, sizeBytes - suffixLength), end: sizeBytes - 1 };
  }

  const start = Number(rawStart);
  if (start >= sizeBytes) return "invalid";
  const end = rawEnd === "" ? sizeBytes - 1 : Math.min(Number(rawEnd), sizeBytes - 1);
  if (end < start) return "invalid";
  return { start, end };
}

export function registerAttachmentRoutes(
  app: FastifyInstance,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  uploadSecret: string,
) {
  async function checkPostAccess(request: FastifyRequest, postId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolvePostWorkspace(postId));
  }

  async function checkAttachmentAccess(request: FastifyRequest, attachmentId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolveAttachmentWorkspace(attachmentId));
  }

  app.get("/api/posts/:id/attachments", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    // The UI needs to know which tile to render before it fetches any bytes, and the stored
    // mimeType is too unreliable to decide that — `curl -F` alone labels an mp4 as
    // application/octet-stream. previewKind is sniffed from the file itself.
    return core.attachments.listAttachmentsForPreview(id);
  });

  app.post("/api/posts/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded (expected multipart field 'file')" });
    }
    const data = await file.toBuffer();
    const attachment = await core.attachments.attachFile({
      postId: id,
      filename: file.filename,
      mimeType: file.mimetype,
      data,
    });
    return reply.code(201).send(attachment);
  });

  // Redeeming an upload ticket. The signed token in the path is the whole credential: it is
  // scoped to one post, carries the filename and MIME type chosen when it was minted, and
  // expires in minutes. That is what lets an MCP agent hand the bytes to `curl` instead of
  // carrying them through its own context as base64, which is impractical for anything but
  // the smallest files. Registered in its own encapsulated scope so the catch-all binary body
  // parser applies to this route and nowhere else.
  app.register(async (scope) => {
    // This is the one route with no session behind it — the ticket is the whole credential — so
    // an unauthenticated caller can reach it and make the server do work.
    await scope.register(rateLimit, { global: false });

    scope.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

    scope.put<{ Querystring: { ticket?: string } }>(
      "/api/attachments/upload",
      {
        bodyLimit: MAX_ATTACHMENT_BYTES,
        // Uploads are inherently rare (a handful per post), so 30/min/IP sits far above honest
        // traffic while capping what a single source can force the server to read.
        config: { rateLimit: { max: UPLOAD_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } },
        // preParsing, not onRequest: it still runs before the body is read, so an invalid ticket
        // costs one HMAC instead of up to 25 MB buffered into memory, but it now runs *after*
        // the limiter's onRequest hook. That ordering is the whole point — the flood worth
        // stopping is a stream of *invalid* tickets, and checking the ticket in onRequest replies
        // 403 before the limiter ever counts the request, leaving the counter at zero while the
        // flood continues. The tests pin both halves: 403 rather than 413 on an oversized body,
        // and 429 on the attempt past the limit.
        preParsing: async (request, reply, payload) => {
          const verified = verifyUploadTicket(request.query.ticket ?? "", uploadSecret);
          if (!verified.ok) {
            return reply
              .code(403)
              .send({ error: `Upload ticket ${verified.reason}. Call prepare_attachment_upload again for a fresh one.` });
          }
          return payload;
        },
      },
      async (request, reply) => {
        // Re-verified rather than stashed on the request in the hook above: the HMAC costs
        // microseconds, and the handler stays readable without per-request state plumbing.
        const verified = verifyUploadTicket(request.query.ticket ?? "", uploadSecret);
        if (!verified.ok) {
          return reply
            .code(403)
            .send({ error: `Upload ticket ${verified.reason}. Call prepare_attachment_upload again for a fresh one.` });
        }

        // The ticket proves the caller was authorized when it was minted, not that the post is
        // still there and still in that workspace — a delete or a move in between must not be
        // overridden by a ticket issued before it.
        const { postId, workspaceId, filename, mimeType } = verified.claims;
        if ((await core.authz.resolvePostWorkspace(postId)) !== workspaceId) {
          return reply.code(403).send({ error: "Upload ticket no longer matches this post's workspace." });
        }

        const data = request.body;
        if (!Buffer.isBuffer(data) || data.length === 0) {
          return reply
            .code(400)
            .send({ error: "Empty body — send the raw file bytes, e.g. curl -T <file> '<uploadUrl>'." });
        }

        const attachment = await core.attachments.attachFile({ postId, filename, mimeType, data });
        return reply.code(201).send(attachment);
      },
    );
  });

  // Serving an attachment for display rather than download. Everything here follows from one
  // fact: these bytes came from outside and are served from the same origin as the app and its
  // session cookie. So the type is decided by sniffing the file, never by the mimeType the
  // uploader supplied; anything not on the sniffed whitelist is refused rather than guessed at;
  // and the response carries nosniff plus a sandbox CSP so a file that slipped through as the
  // wrong type still cannot execute anything. SVG is deliberately absent from the whitelist.
  app.get("/api/attachments/:id/preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkAttachmentAccess(request, id);

    const { meta, detected } = await core.attachments.describeForPreview(id);
    if (!detected) {
      return reply.code(415).send({ error: `${meta.filename} is not a file type this service previews inline.` });
    }

    reply.header("Content-Type", detected.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(meta.filename)}"`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'; media-src 'self'; sandbox");
    reply.header("Cache-Control", "private, max-age=300");
    reply.header("Accept-Ranges", "bytes");

    const range = parseRangeHeader(request.headers.range, meta.sizeBytes);
    if (range === "invalid") {
      return reply.code(416).header("Content-Range", `bytes */${meta.sizeBytes}`).send();
    }
    if (range) {
      const data = await core.attachments.readAttachmentRange(id, range.start, range.end);
      return reply
        .code(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${meta.sizeBytes}`)
        .header("Content-Length", String(data.length))
        .send(data);
    }

    const { data } = await core.attachments.downloadAttachment(id);
    return reply.send(data);
  });

  app.get("/api/attachments/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkAttachmentAccess(request, id);
    const { meta, data } = await core.attachments.downloadAttachment(id);
    reply.header("Content-Type", meta.mimeType);
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(meta.filename)}"`);
    return reply.send(data);
  });

  app.delete("/api/attachments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkAttachmentAccess(request, id);
    await core.attachments.deleteAttachment(id);
    return reply.code(204).send();
  });
}
