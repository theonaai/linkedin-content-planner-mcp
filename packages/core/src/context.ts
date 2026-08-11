import type { Db } from "@linkedin-planner/db";
import { createPostService } from "./services/posts.js";
import { createVersionService } from "./services/versions.js";
import { createCommentService } from "./services/comments.js";
import { createReviewService } from "./services/reviews.js";
import { createAttachmentService } from "./services/attachments.js";
import { createWebhookService } from "./services/webhooks.js";
import { createUserService } from "./services/users.js";
import { createAuthzService } from "./services/authz.js";
import { createInviteService } from "./services/invites.js";
import type { StorageAdapter } from "./storage.js";

export function createCoreServices(db: Db, storage: StorageAdapter) {
  const attachments = createAttachmentService(db, storage);
  const webhooks = createWebhookService(db);
  const posts = createPostService(db, { attachmentService: attachments, webhookService: webhooks });
  const versions = createVersionService(db);
  const comments = createCommentService(db, { versionService: versions, postService: posts, webhookService: webhooks });
  const reviews = createReviewService(db, {
    postService: posts,
    versionService: versions,
    webhookService: webhooks,
  });
  const users = createUserService(db);
  const authz = createAuthzService(db);
  const invites = createInviteService(db);

  return { posts, versions, comments, reviews, attachments, webhooks, users, authz, invites };
}

export type CoreServices = ReturnType<typeof createCoreServices>;
