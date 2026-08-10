import { z } from "zod";

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
  initialContent: z.string().optional(),
});

export const listPostsInputSchema = z.object({
  states: z.array(postStateSchema).optional(),
  scheduledBefore: z.string().optional(),
  scheduledAfter: z.string().optional(),
  platform: platformSchema.optional(),
});

export const setPostStateInputSchema = z.object({ toState: postStateSchema });

export const setPostDateInputSchema = z.object({ scheduledDate: z.string().nullable() });

export const updateContentInputSchema = z.object({ contentMarkdown: z.string() });

export const strReplaceContentInputSchema = z.object({
  oldStr: z.string().min(1),
  newStr: z.string(),
});

export const revertToVersionInputSchema = z.object({ versionId: z.string().uuid() });

export const getVersionDiffInputSchema = z.object({
  versionIdA: z.string().uuid(),
  versionIdB: z.string().uuid(),
});

export const submitReviewInputSchema = z.object({
  decision: reviewDecisionSchema,
  body: z.string().optional(),
});

export const addCommentInputSchema = z.object({
  body: z.string().min(1),
  anchorOffset: z.number().int().nonnegative().optional(),
  anchorLength: z.number().int().positive().optional(),
  parentCommentId: z.string().uuid().optional(),
});

export const resolveCommentInputSchema = z.object({ resolved: z.boolean() });
