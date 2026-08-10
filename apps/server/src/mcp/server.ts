import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type CoreServices,
  createPostInputSchema,
  listPostsInputSchema,
  getVersionDiffInputSchema,
  addCommentInputSchema,
  postStateSchema,
  reviewDecisionSchema,
  strReplaceContentInputSchema,
  createWebhookInputSchema,
  updateWebhookInputSchema,
} from "@linkedin-planner/core";
import { toLinkedInPreview, MARKDOWN_SUBSET_DESCRIPTION } from "@linkedin-planner/formatting";

function jsonContent(data: unknown) {
  // JSON.stringify(undefined) returns undefined, not a string, which the MCP SDK's own
  // response validation rejects — fall back to null for tools whose core function returns
  // void (e.g. delete_post) so the result is always a valid text content block.
  return { content: [{ type: "text" as const, text: JSON.stringify(data ?? null, null, 2) }] };
}

function safe<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      return jsonContent(await fn());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  };
}

export function createMcpServer(core: CoreServices, workspaceId: string): McpServer {
  const server = new McpServer({ name: "linkedin-content-planner", version: "0.0.0" });

  server.registerTool(
    "create_post",
    {
      description: "Add a new post idea to the backlog.",
      inputSchema: createPostInputSchema.shape,
    },
    (args) => safe(() => core.posts.createPost({ workspaceId, ...args }))(),
  );

  server.registerTool(
    "list_posts",
    {
      description:
        "List posts, optionally filtered by state(s) and scheduled-date range. E.g. state=ready + scheduledBefore=<today> finds posts due to publish.",
      inputSchema: listPostsInputSchema.shape,
    },
    (args) => safe(() => core.posts.listPosts({ workspaceId, ...args }))(),
  );

  server.registerTool(
    "get_post",
    {
      description: "Get a single post by id.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) => safe(() => core.posts.getPost(args.postId))(),
  );

  server.registerTool(
    "update_post_content",
    {
      description: `Create a new version of a post with updated content. ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { postId: z.string().uuid(), contentMarkdown: z.string() },
    },
    (args) => safe(() => core.versions.updatePostContent(args))(),
  );

  server.registerTool(
    "str_replace_post_content",
    {
      description:
        "Targeted edit: replaces exactly one occurrence of oldStr with newStr in the post's latest content and creates a new version, without reproducing the whole draft. oldStr must match verbatim exactly once — no match or an ambiguous (>1) match both fail with a specific error (the ambiguous case lists the matching line numbers) so you can retry with more context. Prefer this over update_post_content for small, targeted changes (fix a phrase, swap a stat, tweak a line) — it's cheaper and safer than resending the entire draft, and matters even more on longer content like a Substack article. " +
        `Content follows the same rules as update_post_content: ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { postId: z.string().uuid(), ...strReplaceContentInputSchema.shape },
    },
    (args) => safe(() => core.versions.strReplaceContent(args))(),
  );

  server.registerTool(
    "list_versions",
    {
      description: "List all versions of a post, oldest first.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) => safe(() => core.versions.listVersions(args.postId))(),
  );

  server.registerTool(
    "get_version_diff",
    {
      description: "Get a line-level diff between two versions of a post.",
      inputSchema: getVersionDiffInputSchema.shape,
    },
    (args) => safe(() => core.versions.getVersionDiff(args))(),
  );

  server.registerTool(
    "revert_to_version",
    {
      description: "Create a new version copying an older version's content (history stays append-only).",
      inputSchema: { postId: z.string().uuid(), versionId: z.string().uuid() },
    },
    (args) => safe(() => core.versions.revertToVersion(args))(),
  );

  server.registerTool(
    "set_post_state",
    {
      description:
        "Move a post to a new state. The server enforces the legal-transition graph: backlog<->todo<->in_progress->in_review, ready->posted, ready->in_progress. Entering in_review is allowed here; leaving in_review (to ready or back to in_progress) only happens via submit_review.",
      inputSchema: { postId: z.string().uuid(), toState: postStateSchema },
    },
    (args) => safe(() => core.posts.setPostState(args))(),
  );

  server.registerTool(
    "set_post_date",
    {
      description: "Set (or clear, with null) a post's scheduled publish date.",
      inputSchema: { postId: z.string().uuid(), scheduledDate: z.string().nullable() },
    },
    (args) => safe(() => core.posts.setPostDate(args))(),
  );

  server.registerTool(
    "delete_post",
    {
      description:
        "Permanently delete a post and everything attached to it (all versions, comments, reviews, and attachment files). Irreversible — there is no undo. Use for genuinely unwanted posts (duplicates, abandoned ideas), not as a way to unpublish something already posted.",
      inputSchema: { postId: z.string().uuid() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      safe(async () => {
        await core.posts.deletePost(args.postId);
        return { deleted: true, postId: args.postId };
      })(),
  );

  server.registerTool(
    "submit_review",
    {
      description:
        "Approve or request changes on a post that is in_review. Approving moves it to ready; requesting changes moves it back to in_progress and requires a body explaining what to fix.",
      inputSchema: {
        postId: z.string().uuid(),
        decision: reviewDecisionSchema,
        body: z.string().optional(),
      },
    },
    (args) => safe(() => core.reviews.submitReview(args))(),
  );

  server.registerTool(
    "list_reviews",
    {
      description: "List the review history (approve/request-changes decisions) for a post.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) => safe(() => core.reviews.listReviews(args.postId))(),
  );

  server.registerTool(
    "add_comment",
    {
      description: "Add a comment on a post version, optionally anchored to a text range and/or threaded as a reply.",
      inputSchema: { postVersionId: z.string().uuid(), ...addCommentInputSchema.shape },
    },
    (args) => safe(() => core.comments.addComment(args))(),
  );

  server.registerTool(
    "list_comments",
    {
      description:
        "List all comments on a post (across every version), oldest first. Anchors are resolved onto " +
        "the latest version wherever the commented text is unchanged (resolvedAnchorOffset/Length); " +
        "anchorStale is true when the text a comment referred to was edited or removed since.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) => safe(() => core.comments.listCommentsForLatestVersion(args.postId))(),
  );

  server.registerTool(
    "resolve_comment",
    {
      description: "Mark a comment resolved or unresolved.",
      inputSchema: { commentId: z.string().uuid(), resolved: z.boolean() },
    },
    (args) => safe(() => core.comments.resolveComment(args))(),
  );

  server.registerTool(
    "render_preview",
    {
      description: `Render content as it will appear on LinkedIn (as Unicode text — bold/italic are real Unicode characters, not markup, since that's what LinkedIn itself renders). Useful to preview before saving, or to sanity-check formatting. ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { contentMarkdown: z.string() },
    },
    (args) => safe(async () => ({ preview: toLinkedInPreview(args.contentMarkdown) }))(),
  );

  server.registerTool(
    "attach_file",
    {
      description:
        "Attach a file (e.g. a PDF carousel or image) to a post. Pass the file bytes as base64.",
      inputSchema: {
        postId: z.string().uuid(),
        filename: z.string(),
        mimeType: z.string(),
        contentBase64: z.string(),
      },
    },
    (args) =>
      safe(() =>
        core.attachments.attachFile({
          postId: args.postId,
          filename: args.filename,
          mimeType: args.mimeType,
          data: Buffer.from(args.contentBase64, "base64"),
        }),
      )(),
  );

  server.registerTool(
    "list_attachments",
    {
      description: "List attachments on a post (metadata only, not file bytes).",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) => safe(() => core.attachments.listAttachments(args.postId))(),
  );

  server.registerTool(
    "create_webhook",
    {
      description:
        "Register a webhook that gets a POST request whenever a chosen event happens (post.created, " +
        "post.state_changed, post.review_changes_requested, post.review_approved, post.comment_added, " +
        "post.deleted). Pass a secret to have deliveries signed with an X-Webhook-Signature header " +
        "(sha256=<hmac>) so the receiver can verify authenticity.",
      inputSchema: createWebhookInputSchema.shape,
    },
    (args) => safe(() => core.webhooks.createWebhook({ workspaceId, ...args }))(),
  );

  server.registerTool(
    "list_webhooks",
    {
      description: "List all registered webhooks.",
      inputSchema: {},
    },
    () => safe(() => core.webhooks.listWebhooks(workspaceId))(),
  );

  server.registerTool(
    "update_webhook",
    {
      description:
        "Update a webhook's URL, subscribed events, secret, or active flag. Set active=false to " +
        "pause deliveries without deleting the subscription.",
      inputSchema: { webhookId: z.string().uuid(), ...updateWebhookInputSchema.shape },
    },
    (args) => safe(() => core.webhooks.updateWebhook(args))(),
  );

  server.registerTool(
    "delete_webhook",
    {
      description: "Permanently delete a webhook subscription and its delivery history.",
      inputSchema: { webhookId: z.string().uuid() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      safe(async () => {
        await core.webhooks.deleteWebhook(args.webhookId);
        return { deleted: true, webhookId: args.webhookId };
      })(),
  );

  server.registerTool(
    "list_webhook_deliveries",
    {
      description:
        "List delivery attempts for a webhook (success/failure, response status, error), newest first — useful for debugging why an agent didn't get triggered.",
      inputSchema: { webhookId: z.string().uuid() },
    },
    (args) => safe(() => core.webhooks.listDeliveries(args.webhookId))(),
  );

  return server;
}
