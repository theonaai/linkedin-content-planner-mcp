import type { FastifyInstance, FastifyRequest } from "fastify";
import type { CoreServices } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";

export function registerAttachmentRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv | { enabled: false }) {
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
