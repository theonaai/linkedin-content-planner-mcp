import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { attachments, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";
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

    async attachFile(params: { postId: string; filename: string; mimeType: string; data: Buffer }) {
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
