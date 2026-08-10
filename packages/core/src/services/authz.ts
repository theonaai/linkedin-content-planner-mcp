import { eq } from "drizzle-orm";
import { posts, postVersions, comments, reviews, attachments, webhooks, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";

/** Resolves "which workspace does this resource belong to" for every entity the REST layer
 * exposes by id — the thing every route needs to know before it can check the caller is
 * actually a member of that workspace. Kept as a single small module (rather than spread
 * across each entity's own service) since it's a cross-cutting authorization concern, not
 * business logic those services should otherwise need to know about. */
export function createAuthzService(db: Db) {
  async function resolvePostWorkspace(postId: string): Promise<string> {
    const [row] = await db.select({ workspaceId: posts.workspaceId }).from(posts).where(eq(posts.id, postId)).limit(1);
    if (!row) throw new NotFoundError("Post", postId);
    return row.workspaceId;
  }

  async function resolveVersionWorkspace(versionId: string): Promise<string> {
    const [row] = await db
      .select({ workspaceId: posts.workspaceId })
      .from(postVersions)
      .innerJoin(posts, eq(postVersions.postId, posts.id))
      .where(eq(postVersions.id, versionId))
      .limit(1);
    if (!row) throw new NotFoundError("PostVersion", versionId);
    return row.workspaceId;
  }

  async function resolveCommentWorkspace(commentId: string): Promise<string> {
    const [row] = await db
      .select({ workspaceId: posts.workspaceId })
      .from(comments)
      .innerJoin(postVersions, eq(comments.postVersionId, postVersions.id))
      .innerJoin(posts, eq(postVersions.postId, posts.id))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row) throw new NotFoundError("Comment", commentId);
    return row.workspaceId;
  }

  async function resolveReviewWorkspace(reviewId: string): Promise<string> {
    const [row] = await db
      .select({ workspaceId: posts.workspaceId })
      .from(reviews)
      .innerJoin(postVersions, eq(reviews.postVersionId, postVersions.id))
      .innerJoin(posts, eq(postVersions.postId, posts.id))
      .where(eq(reviews.id, reviewId))
      .limit(1);
    if (!row) throw new NotFoundError("Review", reviewId);
    return row.workspaceId;
  }

  async function resolveAttachmentWorkspace(attachmentId: string): Promise<string> {
    const [row] = await db
      .select({ workspaceId: posts.workspaceId })
      .from(attachments)
      .innerJoin(posts, eq(attachments.postId, posts.id))
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    if (!row) throw new NotFoundError("Attachment", attachmentId);
    return row.workspaceId;
  }

  async function resolveWebhookWorkspace(webhookId: string): Promise<string> {
    const [row] = await db
      .select({ workspaceId: webhooks.workspaceId })
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1);
    if (!row) throw new NotFoundError("Webhook", webhookId);
    return row.workspaceId;
  }

  return {
    resolvePostWorkspace,
    resolveVersionWorkspace,
    resolveCommentWorkspace,
    resolveReviewWorkspace,
    resolveAttachmentWorkspace,
    resolveWebhookWorkspace,
  };
}

export type AuthzService = ReturnType<typeof createAuthzService>;
