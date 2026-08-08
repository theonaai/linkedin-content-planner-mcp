import type { Db } from "@linkedin-planner/db";
import { createPostService } from "./services/posts.js";
import { createVersionService } from "./services/versions.js";
import { createCommentService } from "./services/comments.js";
import { createReviewService } from "./services/reviews.js";
import { createAttachmentService } from "./services/attachments.js";
import type { StorageAdapter } from "./storage.js";

export function createCoreServices(db: Db, storage: StorageAdapter) {
  const posts = createPostService(db);
  const versions = createVersionService(db);
  const comments = createCommentService(db);
  const reviews = createReviewService(db, { postService: posts, versionService: versions });
  const attachments = createAttachmentService(db, storage);

  return { posts, versions, comments, reviews, attachments };
}

export type CoreServices = ReturnType<typeof createCoreServices>;
