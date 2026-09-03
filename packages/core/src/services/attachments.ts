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
import { detectMediaType, MEDIA_TYPE_SNIFF_BYTES } from "../mediaType.js";

export function createAttachmentService(db: Db, storage: StorageAdapter) {
  /** Just enough of the file to identify it, without pulling 25 MB to look at 32 bytes. */
  async function readHead(storageKey: string): Promise<Buffer> {
    if (storage.readRange) return storage.readRange(storageKey, 0, MEDIA_TYPE_SNIFF_BYTES - 1);
    return (await storage.read(storageKey)).subarray(0, MEDIA_TYPE_SNIFF_BYTES);
  }

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

    /** Metadata plus what the bytes actually are, or null when they are nothing we will show
     * inline. The stored mimeType is not consulted: it is whatever the uploader claimed. */
    async describeForPreview(attachmentId: string) {
      const meta = await getAttachment(attachmentId);
      return { meta, detected: detectMediaType(await readHead(meta.storageKey)) };
    },

    /** One inclusive byte window, for serving HTTP Range requests. */
    async readAttachmentRange(attachmentId: string, start: number, end: number) {
      const meta = await getAttachment(attachmentId);
      if (storage.readRange) return storage.readRange(meta.storageKey, start, end);
      return (await storage.read(meta.storageKey)).subarray(start, end + 1);
    },

    /** The list the web UI renders, with each entry told apart by its bytes so a video the
     * uploader labelled application/octet-stream still gets a video tile. Costs one small
     * ranged read per attachment; posts carry a handful, not hundreds. */
    async listAttachmentsForPreview(postId: string) {
      const rows = await db
        .select()
        .from(attachments)
        .where(eq(attachments.postId, postId))
        .orderBy(asc(attachments.createdAt));
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          previewKind: detectMediaType(await readHead(row.storageKey))?.kind ?? null,
        })),
      );
    },

    async deleteAttachment(attachmentId: string) {
      const meta = await getAttachment(attachmentId);
      await storage.delete(meta.storageKey);
      await db.delete(attachments).where(eq(attachments.id, attachmentId));
    },
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
