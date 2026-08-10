import { z } from "zod";
import {
  MAX_CONTENT_LENGTH,
  MAX_STR_REPLACE_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  MAX_REVIEW_BODY_LENGTH,
  MAX_WEBHOOK_URL_LENGTH,
  MAX_WEBHOOK_SECRET_LENGTH,
} from "./limits.js";

export const platformSchema = z.enum(["linkedin", "substack"]);
export const postStateSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "ready",
  "posted",
]);
export const reviewDecisionSchema = z.enum(["approved", "changes_requested"]);

export const createPostInputSchema = z.object({
  platform: platformSchema.optional(),
  initialContent: z.string().max(MAX_CONTENT_LENGTH).optional(),
});

export const listPostsInputSchema = z.object({
  states: z.array(postStateSchema).optional(),
  scheduledBefore: z.string().optional(),
  scheduledAfter: z.string().optional(),
  platform: platformSchema.optional(),
});

export const setPostStateInputSchema = z.object({ toState: postStateSchema });

export const setPostDateInputSchema = z.object({ scheduledDate: z.string().nullable() });

export const updateContentInputSchema = z.object({
  contentMarkdown: z.string().max(MAX_CONTENT_LENGTH),
});

export const strReplaceContentInputSchema = z.object({
  oldStr: z.string().min(1).max(MAX_STR_REPLACE_LENGTH),
  newStr: z.string().max(MAX_STR_REPLACE_LENGTH),
});

export const revertToVersionInputSchema = z.object({ versionId: z.string().uuid() });

export const getVersionDiffInputSchema = z.object({
  versionIdA: z.string().uuid(),
  versionIdB: z.string().uuid(),
});

export const submitReviewInputSchema = z.object({
  decision: reviewDecisionSchema,
  body: z.string().max(MAX_REVIEW_BODY_LENGTH).optional(),
});

export const addCommentInputSchema = z.object({
  body: z.string().min(1).max(MAX_COMMENT_BODY_LENGTH),
  anchorOffset: z.number().int().nonnegative().optional(),
  anchorLength: z.number().int().positive().optional(),
  parentCommentId: z.string().uuid().optional(),
});

export const resolveCommentInputSchema = z.object({ resolved: z.boolean() });

export const webhookEventSchema = z.enum([
  "post.created",
  "post.state_changed",
  "post.review_changes_requested",
  "post.review_approved",
  "post.comment_added",
  "post.deleted",
]);

export const createWebhookInputSchema = z.object({
  url: z.string().url().max(MAX_WEBHOOK_URL_LENGTH),
  events: z.array(webhookEventSchema).min(1),
  secret: z.string().min(1).max(MAX_WEBHOOK_SECRET_LENGTH).optional(),
});

export const updateWebhookInputSchema = z.object({
  url: z.string().url().max(MAX_WEBHOOK_URL_LENGTH).optional(),
  events: z.array(webhookEventSchema).min(1).optional(),
  secret: z.string().min(1).max(MAX_WEBHOOK_SECRET_LENGTH).nullable().optional(),
  active: z.boolean().optional(),
});
