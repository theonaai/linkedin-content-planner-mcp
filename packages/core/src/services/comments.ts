import { eq, asc } from "drizzle-orm";
import { comments, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";

export function createCommentService(db: Db) {
  return {
    async addComment(params: {
      postVersionId: string;
      body: string;
      anchorOffset?: number;
      anchorLength?: number;
      parentCommentId?: string;
      authorId?: string;
    }) {
      const [comment] = await db
        .insert(comments)
        .values({
          postVersionId: params.postVersionId,
          body: params.body,
          anchorOffset: params.anchorOffset ?? null,
          anchorLength: params.anchorLength ?? null,
          parentCommentId: params.parentCommentId ?? null,
          authorId: params.authorId ?? null,
        })
        .returning();
      return comment;
    },

    async listComments(postVersionId: string) {
      return db
        .select()
        .from(comments)
        .where(eq(comments.postVersionId, postVersionId))
        .orderBy(asc(comments.createdAt));
    },

    async resolveComment(params: { commentId: string; resolved: boolean }) {
      const [updated] = await db
        .update(comments)
        .set({ resolved: params.resolved })
        .where(eq(comments.id, params.commentId))
        .returning();
      if (!updated) throw new NotFoundError("Comment", params.commentId);
      return updated;
    },
  };
}

export type CommentService = ReturnType<typeof createCommentService>;
