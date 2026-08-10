import { describe, it, expect } from "vitest";
import {
  createPostInputSchema,
  updateContentInputSchema,
  strReplaceContentInputSchema,
  addCommentInputSchema,
  submitReviewInputSchema,
  createWebhookInputSchema,
} from "./schemas.js";
import {
  MAX_CONTENT_LENGTH,
  MAX_STR_REPLACE_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  MAX_REVIEW_BODY_LENGTH,
  MAX_WEBHOOK_URL_LENGTH,
  MAX_WEBHOOK_SECRET_LENGTH,
} from "./limits.js";

describe("size limits", () => {
  it("accepts content at the limit and rejects one character over it", () => {
    expect(createPostInputSchema.safeParse({ initialContent: "a".repeat(MAX_CONTENT_LENGTH) }).success).toBe(
      true,
    );
    expect(
      createPostInputSchema.safeParse({ initialContent: "a".repeat(MAX_CONTENT_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("rejects an oversized contentMarkdown update", () => {
    expect(updateContentInputSchema.safeParse({ contentMarkdown: "a".repeat(MAX_CONTENT_LENGTH) }).success).toBe(
      true,
    );
    expect(
      updateContentInputSchema.safeParse({ contentMarkdown: "a".repeat(MAX_CONTENT_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("rejects oversized oldStr/newStr in str_replace", () => {
    const tooLong = "a".repeat(MAX_STR_REPLACE_LENGTH + 1);
    expect(strReplaceContentInputSchema.safeParse({ oldStr: tooLong, newStr: "x" }).success).toBe(false);
    expect(strReplaceContentInputSchema.safeParse({ oldStr: "x", newStr: tooLong }).success).toBe(false);
  });

  it("rejects an oversized comment body", () => {
    expect(addCommentInputSchema.safeParse({ body: "a".repeat(MAX_COMMENT_BODY_LENGTH) }).success).toBe(true);
    expect(addCommentInputSchema.safeParse({ body: "a".repeat(MAX_COMMENT_BODY_LENGTH + 1) }).success).toBe(
      false,
    );
  });

  it("rejects an oversized review body", () => {
    expect(
      submitReviewInputSchema.safeParse({ decision: "approved", body: "a".repeat(MAX_REVIEW_BODY_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      submitReviewInputSchema.safeParse({
        decision: "approved",
        body: "a".repeat(MAX_REVIEW_BODY_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects an oversized webhook url or secret", () => {
    const longPath = "a".repeat(MAX_WEBHOOK_URL_LENGTH);
    const tooLongUrl = `https://example.com/${longPath}`;
    expect(createWebhookInputSchema.safeParse({ url: tooLongUrl, events: ["post.created"] }).success).toBe(
      false,
    );
    expect(
      createWebhookInputSchema.safeParse({
        url: "https://example.com/hook",
        events: ["post.created"],
        secret: "a".repeat(MAX_WEBHOOK_SECRET_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
