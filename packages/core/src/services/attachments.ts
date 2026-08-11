import { randomUUID } from "node:crypto";
import { eq, asc, sql } from "drizzle-orm";
import { attachments, posts, type Db } from "@linkedin-planner/db";
import { NotFoundError, ValidationError } from "../errors.js";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_FILENAME_LENGTH,
  MAX_MIME_TYPE_LENGTH,
  MAX_WORKSPACE_ATTACHMENT_BYTES,
} from "../limits.js";
import type { StorageAdapter } from "../storage.js";

export function createAttachmentService(db: Db, storage: StorageAdapter) {
  async function getAttachment(attachmentId: string) {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
    if (!row) throw new NotFoundError("Attachment", attachmentId);
    return row;
  }

  return {
    getAttachment,

    async listAttachments(postId: string) {
      return db.select().from(attachments).where(eq(attachments.postId, postId)).orderBy(asc(attachments.createdAt));
    },

    /** The single choke point for both REST (multipart, already capped by Fastify's own
     * fileSize limit) and MCP (base64, which bypasses Fastify entirely) attachment uploads —
     * enforcing the size/name limits here means MCP can't skip the cap REST already has. */
    async attachFile(params: { postId: string; filename: string; mimeType: string; data: Buffer }) {
      if (params.data.length > MAX_ATTACHMENT_BYTES) {
        throw new ValidationError(
          `Attachment too large: ${params.data.length} bytes exceeds the ${MAX_ATTACHMENT_BYTES}-byte (25 MB) limit.`,
        );
      }
      if (params.filename.length > MAX_FILENAME_LENGTH) {
        throw new ValidationError(`Filename too long: exceeds ${MAX_FILENAME_LENGTH} characters.`);
      }
      if (params.mimeType.length > MAX_MIME_TYPE_LENGTH) {
        throw new ValidationError(`MIME type too long: exceeds ${MAX_MIME_TYPE_LENGTH} characters.`);
      }

      const [post] = await db.select({ workspaceId: posts.workspaceId }).from(posts).where(eq(posts.id, params.postId)).limit(1);
      if (!post) throw new NotFoundError("Post", params.postId);

      const [{ total }] = await db
        .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::int` })
        .from(attachments)
        .innerJoin(posts, eq(attachments.postId, posts.id))
        .where(eq(posts.workspaceId, post.workspaceId));
      if (total + params.data.length > MAX_WORKSPACE_ATTACHMENT_BYTES) {
        throw new ValidationError(
          `Workspace attachment storage limit exceeded: this upload would bring total usage to ` +
            `${total + params.data.length} bytes, over the ${MAX_WORKSPACE_ATTACHMENT_BYTES}-byte (250 MB) limit. ` +
            `Delete unused attachments to free up space.`,
        );
      }

      const storageKey = `${params.postId}/${randomUUID()}-${params.filename}`;
      await storage.save(storageKey, params.data);
      const [row] = await db
        .insert(attachments)
        .values({
          postId: params.postId,
          storageKey,
          filename: params.filename,
          mimeType: params.mimeType,
          sizeBytes: params.data.length,
        })
        .returning();
      return row;
    },

    async downloadAttachment(attachmentId: string) {
      const meta = await getAttachment(attachmentId);
      const data = await storage.read(meta.storageKey);
      return { meta, data };
    },

    async deleteAttachment(attachmentId: string) {
      const meta = await getAttachment(attachmentId);
      await storage.delete(meta.storageKey);
      await db.delete(attachments).where(eq(attachments.id, attachmentId));
    },
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
