import { eq, and, gte, lte, inArray, isNull, asc, type SQL } from "drizzle-orm";
import { posts, postVersions, comments, stateEvents, type Db } from "@linkedin-planner/db";
import { assertTransition } from "../stateMachine.js";
import { NotFoundError, ValidationError } from "../errors.js";
import type { PostState, Platform } from "../types.js";

export function createPostService(db: Db) {
  async function getPost(postId: string) {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post) throw new NotFoundError("Post", postId);
    return post;
  }

  /** Submitting for review requires every open thread to be addressed first — checked
   * server-side (not just in the UI) so an agent driving state via MCP is bound by it too.
   * Checked across every version of the post, not just the latest: a comment left on an
   * earlier draft still represents open feedback (and still carries forward onto the
   * latest version wherever its anchored text is unchanged — see comments service), so
   * saving a new version must not silently let an unresolved thread slip past this gate. */
  async function assertNoUnresolvedComments(postId: string) {
    const versionRows = await db
      .select({ id: postVersions.id })
      .from(postVersions)
      .where(eq(postVersions.postId, postId));
    if (versionRows.length === 0) return;

    const unresolved = await db
      .select()
      .from(comments)
      .where(
        and(
          inArray(
            comments.postVersionId,
            versionRows.map((v) => v.id),
          ),
          isNull(comments.parentCommentId),
          eq(comments.resolved, false),
        ),
      );
    if (unresolved.length > 0) {
      throw new ValidationError(
        `Cannot submit for review: ${unresolved.length} unresolved comment(s) remain.`,
      );
    }
  }

  return {
    getPost,

    async createPost(params: {
      workspaceId: string;
      platform?: Platform;
      initialContent?: string;
      authorId?: string;
    }) {
      const [post] = await db
        .insert(posts)
        .values({
          workspaceId: params.workspaceId,
          platform: params.platform ?? "linkedin",
          state: "backlog",
        })
        .returning();

      await db.insert(postVersions).values({
        postId: post.id,
        contentMarkdown: params.initialContent ?? "",
        authorId: params.authorId ?? null,
      });

      await db.insert(stateEvents).values({
        postId: post.id,
        fromState: null,
        toState: "backlog",
        actorId: params.authorId ?? null,
      });

      return post;
    },

    async listPosts(params: {
      workspaceId: string;
      states?: PostState[];
      scheduledBefore?: string;
      scheduledAfter?: string;
      platform?: Platform;
    }) {
      const conditions: SQL[] = [eq(posts.workspaceId, params.workspaceId)];
      if (params.states?.length) conditions.push(inArray(posts.state, params.states));
      if (params.scheduledBefore) conditions.push(lte(posts.scheduledDate, params.scheduledBefore));
      if (params.scheduledAfter) conditions.push(gte(posts.scheduledDate, params.scheduledAfter));
      if (params.platform) conditions.push(eq(posts.platform, params.platform));

      return db
        .select()
        .from(posts)
        .where(and(...conditions))
        .orderBy(asc(posts.scheduledDate));
    },

    async setPostState(params: { postId: string; toState: PostState; actorId?: string }) {
      const post = await getPost(params.postId);
      assertTransition(post.state, params.toState);
      if (params.toState === "in_review") {
        await assertNoUnresolvedComments(params.postId);
      }

      const [updated] = await db
        .update(posts)
        .set({ state: params.toState, updatedAt: new Date() })
        .where(eq(posts.id, params.postId))
        .returning();

      await db.insert(stateEvents).values({
        postId: params.postId,
        fromState: post.state,
        toState: params.toState,
        actorId: params.actorId ?? null,
      });

      return updated;
    },

    async setPostDate(params: { postId: string; scheduledDate: string | null }) {
      await getPost(params.postId);
      const [updated] = await db
        .update(posts)
        .set({ scheduledDate: params.scheduledDate, updatedAt: new Date() })
        .where(eq(posts.id, params.postId))
        .returning();
      return updated;
    },
  };
}

export type PostService = ReturnType<typeof createPostService>;
