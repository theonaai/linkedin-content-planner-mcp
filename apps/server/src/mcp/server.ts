import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type CoreServices,
  createPostInputSchema,
  listPostsInputSchema,
  getVersionDiffInputSchema,
  addCommentInputSchema,
  postStateSchema,
  strReplaceContentInputSchema,
  createWebhookInputSchema,
  updateWebhookInputSchema,
  updateContentInputSchema,
  submitReviewInputSchema,
  NotFoundError,
  MAX_CONTENT_LENGTH,
  MAX_FILENAME_LENGTH,
  MAX_MIME_TYPE_LENGTH,
  MAX_ATTACHMENT_BASE64_LENGTH,
  MAX_ATTACHMENT_BYTES,
} from "@linkedin-planner/core";
import { toLinkedInPreview, MARKDOWN_SUBSET_DESCRIPTION } from "@linkedin-planner/formatting";
import {
  mintUploadTicket,
  uploadUrlFor,
  UPLOAD_TICKET_TTL_MS,
  type UploadTicketConfig,
} from "../attachments/uploadTicket.js";

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

export function createMcpServer(core: CoreServices, workspaceId: string, uploads: UploadTicketConfig): McpServer {
  const server = new McpServer({ name: "linkedin-content-planner", version: "0.0.0" });

  // Every tool that operates on an existing resource by id must confirm that resource
  // actually belongs to this connection's workspace before touching it — otherwise a valid
  // token for workspace A could read/edit/delete workspace B's data just by guessing or
  // being told an id. Throwing NotFoundError (not a distinct "forbidden") for a mismatch
  // matches the REST layer's choice: a non-member can't tell a resource exists at all.
  async function assertPostAccess(postId: string): Promise<void> {
    const actual = await core.authz.resolvePostWorkspace(postId);
    if (actual !== workspaceId) throw new NotFoundError("Post", postId);
  }
  async function assertVersionAccess(versionId: string): Promise<void> {
    const actual = await core.authz.resolveVersionWorkspace(versionId);
    if (actual !== workspaceId) throw new NotFoundError("PostVersion", versionId);
  }
  async function assertCommentAccess(commentId: string): Promise<void> {
    const actual = await core.authz.resolveCommentWorkspace(commentId);
    if (actual !== workspaceId) throw new NotFoundError("Comment", commentId);
  }
  async function assertAttachmentAccess(attachmentId: string): Promise<void> {
    const actual = await core.authz.resolveAttachmentWorkspace(attachmentId);
    if (actual !== workspaceId) throw new NotFoundError("Attachment", attachmentId);
  }
  async function assertWebhookAccess(webhookId: string): Promise<void> {
    const actual = await core.authz.resolveWebhookWorkspace(webhookId);
    if (actual !== workspaceId) throw new NotFoundError("Webhook", webhookId);
  }

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
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.posts.getPost(args.postId);
      })(),
  );

  server.registerTool(
    "update_post_content",
    {
      description: `Create a new version of a post with updated content. ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { postId: z.string().uuid(), ...updateContentInputSchema.shape },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.versions.updatePostContent(args);
      })(),
  );

  server.registerTool(
    "str_replace_post_content",
    {
      description:
        "Targeted edit: replaces exactly one occurrence of oldStr with newStr in the post's latest content and creates a new version, without reproducing the whole draft. oldStr must match verbatim exactly once — no match or an ambiguous (>1) match both fail with a specific error (the ambiguous case lists the matching line numbers) so you can retry with more context. Prefer this over update_post_content for small, targeted changes (fix a phrase, swap a stat, tweak a line) — it's cheaper and safer than resending the entire draft, and matters even more on longer content like a Substack article. " +
        `Content follows the same rules as update_post_content: ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { postId: z.string().uuid(), ...strReplaceContentInputSchema.shape },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.versions.strReplaceContent(args);
      })(),
  );

  server.registerTool(
    "list_versions",
    {
      description: "List all versions of a post, oldest first.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.versions.listVersions(args.postId);
      })(),
  );

  server.registerTool(
    "get_version_diff",
    {
      description: "Get a line-level diff between two versions of a post.",
      inputSchema: getVersionDiffInputSchema.shape,
    },
    (args) =>
      safe(async () => {
        await assertVersionAccess(args.versionIdA);
        await assertVersionAccess(args.versionIdB);
        return core.versions.getVersionDiff(args);
      })(),
  );

  server.registerTool(
    "revert_to_version",
    {
      description: "Create a new version copying an older version's content (history stays append-only).",
      inputSchema: { postId: z.string().uuid(), versionId: z.string().uuid() },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.versions.revertToVersion(args);
      })(),
  );

  server.registerTool(
    "set_post_state",
    {
      description:
        "Move a post to a new state. The server enforces the legal-transition graph: backlog<->todo<->in_progress->in_review, ready->posted, ready->in_progress. Entering in_review is allowed here; leaving in_review (to ready or back to in_progress) only happens via submit_review.",
      inputSchema: { postId: z.string().uuid(), toState: postStateSchema },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.posts.setPostState(args);
      })(),
  );

  server.registerTool(
    "set_post_date",
    {
      description: "Set (or clear, with null) a post's scheduled publish date.",
      inputSchema: { postId: z.string().uuid(), scheduledDate: z.string().nullable() },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.posts.setPostDate(args);
      })(),
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
        await assertPostAccess(args.postId);
        await core.posts.deletePost(args.postId);
        return { deleted: true, postId: args.postId };
      })(),
  );

  server.registerTool(
    "submit_review",
    {
      description:
        "Approve or request changes on a post that is in_review. Approving moves it to ready; requesting changes moves it back to in_progress and requires a body explaining what to fix.",
      inputSchema: { postId: z.string().uuid(), ...submitReviewInputSchema.shape },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.reviews.submitReview(args);
      })(),
  );

  server.registerTool(
    "list_reviews",
    {
      description: "List the review history (approve/request-changes decisions) for a post.",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.reviews.listReviews(args.postId);
      })(),
  );

  server.registerTool(
    "add_comment",
    {
      description: "Add a comment on a post version, optionally anchored to a text range and/or threaded as a reply.",
      inputSchema: { postVersionId: z.string().uuid(), ...addCommentInputSchema.shape },
    },
    (args) =>
      safe(async () => {
        await assertVersionAccess(args.postVersionId);
        return core.comments.addComment(args);
      })(),
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
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.comments.listCommentsForLatestVersion(args.postId);
      })(),
  );

  server.registerTool(
    "resolve_comment",
    {
      description: "Mark a comment resolved or unresolved.",
      inputSchema: { commentId: z.string().uuid(), resolved: z.boolean() },
    },
    (args) =>
      safe(async () => {
        await assertCommentAccess(args.commentId);
        return core.comments.resolveComment(args);
      })(),
  );

  server.registerTool(
    "render_preview",
    {
      description: `Render content as it will appear on LinkedIn (as Unicode text — bold/italic are real Unicode characters, not markup, since that's what LinkedIn itself renders). Useful to preview before saving, or to sanity-check formatting. ${MARKDOWN_SUBSET_DESCRIPTION}`,
      inputSchema: { contentMarkdown: z.string().max(MAX_CONTENT_LENGTH) },
    },
    (args) => safe(async () => ({ preview: toLinkedInPreview(args.contentMarkdown) }))(),
  );

  server.registerTool(
    "prepare_attachment_upload",
    {
      description:
        "Get a short-lived URL to upload an attachment to, instead of passing its bytes through " +
        "this conversation. Returns an uploadUrl to PUT the raw file bytes to (curl -T <file> " +
        `'<uploadUrl>'), valid for ${Math.round(UPLOAD_TICKET_TTL_MS / 60_000)} minutes, capped at ` +
        "25 MB. Prefer this over attach_file for anything but a tiny file: base64 in a tool call " +
        "costs a large slice of the caller's context and one mistyped character silently corrupts " +
        "the stored file. The attachment appears once the upload finishes — confirm with " +
        "list_attachments.",
      inputSchema: {
        postId: z.string().uuid(),
        filename: z.string().max(MAX_FILENAME_LENGTH),
        mimeType: z.string().max(MAX_MIME_TYPE_LENGTH),
      },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        const expiresAt = new Date(Date.now() + UPLOAD_TICKET_TTL_MS);
        const token = mintUploadTicket(
          {
            postId: args.postId,
            workspaceId,
            filename: args.filename,
            mimeType: args.mimeType,
            exp: expiresAt.getTime(),
          },
          uploads.secret,
        );
        const uploadUrl = uploadUrlFor(token, uploads.publicBaseUrl);
        return {
          uploadUrl,
          method: "PUT",
          expiresAt: expiresAt.toISOString(),
          maxBytes: MAX_ATTACHMENT_BYTES,
          example: `curl -T /path/to/${args.filename} '${uploadUrl}'`,
        };
      })(),
  );

  server.registerTool(
    "attach_file",
    {
      description:
        `Attach a file (e.g. a PDF carousel or image) to a post. Pass the file bytes as base64 — ` +
        `capped at 25 MB (${MAX_ATTACHMENT_BASE64_LENGTH.toLocaleString()} base64 characters). ` +
        `Only worth using for small files: prepare_attachment_upload keeps the bytes out of the ` +
        `conversation entirely and is the better choice above roughly 100 KB.`,
      inputSchema: {
        postId: z.string().uuid(),
        filename: z.string().max(MAX_FILENAME_LENGTH),
        mimeType: z.string().max(MAX_MIME_TYPE_LENGTH),
        contentBase64: z.string().max(MAX_ATTACHMENT_BASE64_LENGTH),
      },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.attachments.attachFile({
          postId: args.postId,
          filename: args.filename,
          mimeType: args.mimeType,
          data: Buffer.from(args.contentBase64, "base64"),
        });
      })(),
  );

  server.registerTool(
    "list_attachments",
    {
      description: "List attachments on a post (metadata only, not file bytes).",
      inputSchema: { postId: z.string().uuid() },
    },
    (args) =>
      safe(async () => {
        await assertPostAccess(args.postId);
        return core.attachments.listAttachments(args.postId);
      })(),
  );

  server.registerTool(
    "delete_attachment",
    {
      description:
        "Permanently delete an attachment (both its file and its record) — there is no undo. " +
        "Attachments are the one thing an agent adds repeatedly to the same post: re-rendering a " +
        "carousel leaves the superseded PDF behind, and those count against the 250 MB per-workspace " +
        "storage limit. Delete the old file in the same breath as uploading its replacement. Get the " +
        "id from list_attachments. Deleting a file on a post that is already in review replaces what " +
        "the reviewer is looking at, so do that only when the reviewer asked for it.",
      inputSchema: { attachmentId: z.string().uuid() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      safe(async () => {
        await assertAttachmentAccess(args.attachmentId);
        await core.attachments.deleteAttachment(args.attachmentId);
        return { deleted: true, attachmentId: args.attachmentId };
      })(),
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
    (args) =>
      safe(async () => {
        await assertWebhookAccess(args.webhookId);
        return core.webhooks.updateWebhook(args);
      })(),
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
        await assertWebhookAccess(args.webhookId);
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
    (args) =>
      safe(async () => {
        await assertWebhookAccess(args.webhookId);
        return core.webhooks.listDeliveries(args.webhookId);
      })(),
  );

  return server;
}
