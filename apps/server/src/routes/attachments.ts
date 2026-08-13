import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { type CoreServices, MAX_ATTACHMENT_BYTES } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";
import { verifyUploadTicket } from "../attachments/uploadTicket.js";

/** Per-IP ceiling on upload attempts. See the route config below for the reasoning. */
export const UPLOAD_RATE_LIMIT_PER_MINUTE = 30;

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
    return core.attachments.listAttachments(id);
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
