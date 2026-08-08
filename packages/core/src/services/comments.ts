import { eq, asc, inArray } from "drizzle-orm";
import { comments, type Db } from "@linkedin-planner/db";
import { toLinkedInPreview } from "@linkedin-planner/formatting";
import { NotFoundError } from "../errors.js";
import { remapAnchor } from "../anchorRemap.js";
import type { VersionService } from "./versions.js";

export interface ResolvedComment {
  id: string;
  postVersionId: string;
  parentCommentId: string | null;
  body: string;
  resolved: boolean;
  authorId: string | null;
  createdAt: Date;
  anchorOffset: number | null;
  anchorLength: number | null;
  /** Anchor position relative to the latest version's rendered content. Null when the
   * comment has no anchor, or when it did but the anchored text no longer appears
   * unchanged in the latest version (the comment is "stale" — see below). */
  resolvedAnchorOffset: number | null;
  resolvedAnchorLength: number | null;
  /** True only when the comment originally had an anchor that could not be relocated in
   * the latest version — i.e. the text it referred to was edited or removed since. */
  anchorStale: boolean;
}

export function createCommentService(db: Db, deps: { versionService: VersionService }) {
  const { versionService } = deps;

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

    /** All comments for a post, across every version, with anchors carried forward onto
     * the latest version's content wherever the anchored text is unchanged — the same
     * "still attached to this line" behavior GitHub/git give review comments across
     * commits, rather than silently dropping them the moment a new version is saved. */
    async listCommentsForLatestVersion(postId: string): Promise<ResolvedComment[]> {
      const allVersions = await versionService.listVersions(postId);
      if (allVersions.length === 0) return [];
      const latest = allVersions[allVersions.length - 1];
      const latestFormatted = toLinkedInPreview(latest.contentMarkdown);
      const contentByVersionId = new Map(allVersions.map((v) => [v.id, v.contentMarkdown]));

      const rows = await db
        .select()
        .from(comments)
        .where(
          inArray(
            comments.postVersionId,
            allVersions.map((v) => v.id),
          ),
        )
        .orderBy(asc(comments.createdAt));

      return rows.map((c) => {
        if (c.anchorOffset === null) {
          return { ...c, resolvedAnchorOffset: null, resolvedAnchorLength: null, anchorStale: false };
        }
        if (c.postVersionId === latest.id) {
          return {
            ...c,
            resolvedAnchorOffset: c.anchorOffset,
            resolvedAnchorLength: c.anchorLength,
            anchorStale: false,
          };
        }
        const originContent = contentByVersionId.get(c.postVersionId) ?? "";
        const originFormatted = toLinkedInPreview(originContent);
        const remapped = remapAnchor(originFormatted, latestFormatted, c.anchorOffset, c.anchorLength ?? 0);
        return {
          ...c,
          resolvedAnchorOffset: remapped,
          resolvedAnchorLength: remapped !== null ? c.anchorLength : null,
          anchorStale: remapped === null,
        };
      });
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
