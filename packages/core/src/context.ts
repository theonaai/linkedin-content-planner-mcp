import type { Db } from "@linkedin-planner/db";
import { createPostService } from "./services/posts.js";
import { createVersionService } from "./services/versions.js";
import { createCommentService } from "./services/comments.js";
import { createReviewService } from "./services/reviews.js";

export function createCoreServices(db: Db) {
  const posts = createPostService(db);
  const versions = createVersionService(db);
  const comments = createCommentService(db);
  const reviews = createReviewService(db, { postService: posts, versionService: versions });

  return { posts, versions, comments, reviews };
}

export type CoreServices = ReturnType<typeof createCoreServices>;
