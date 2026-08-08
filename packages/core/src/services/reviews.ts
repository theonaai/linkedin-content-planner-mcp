import { eq, asc, inArray } from "drizzle-orm";
import { reviews, posts, stateEvents, type Db } from "@linkedin-planner/db";
import { ValidationError } from "../errors.js";
import { assertReviewTransition } from "../stateMachine.js";
import type { ReviewDecision } from "../types.js";
import type { PostService } from "./posts.js";
import type { VersionService } from "./versions.js";

export function createReviewService(
  db: Db,
  deps: { postService: PostService; versionService: VersionService },
) {
  const { postService, versionService } = deps;

  return {
    async submitReview(params: {
      postId: string;
      decision: ReviewDecision;
      body?: string;
      reviewerId?: string;
    }) {
      if (params.decision === "changes_requested" && !params.body?.trim()) {
        throw new ValidationError("A note is required when requesting changes");
      }

      const post = await postService.getPost(params.postId);
      const nextState = assertReviewTransition(post.state, params.decision);
      const latestVersion = await versionService.getLatestVersion(params.postId);

      const [review] = await db
        .insert(reviews)
        .values({
          postVersionId: latestVersion.id,
          reviewerId: params.reviewerId ?? null,
          decision: params.decision,
          body: params.body ?? null,
        })
        .returning();

      await db
        .update(posts)
        .set({ state: nextState, updatedAt: new Date() })
        .where(eq(posts.id, params.postId));

      await db.insert(stateEvents).values({
        postId: params.postId,
        fromState: post.state,
        toState: nextState,
        actorId: params.reviewerId ?? null,
      });

      return review;
    },

    async listReviews(postId: string) {
      const versions = await versionService.listVersions(postId);
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length === 0) return [];
      return db
        .select()
        .from(reviews)
        .where(inArray(reviews.postVersionId, versionIds))
        .orderBy(asc(reviews.createdAt));
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
