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
} from "@linkedin-planner/core";
import { toLinkedInPreview } from "@linkedin-planner/formatting";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
      description: "Create a new version of a post with updated content (markdown subset: **bold**, *italic*, line breaks, simple bullets).",
      inputSchema: { postId: z.string().uuid(), contentMarkdown: z.string() },
    },
    (args) => safe(() => core.versions.updatePostContent(args))(),
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
      description: "List comments on a post version, oldest first.",
      inputSchema: { postVersionId: z.string().uuid() },
    },
    (args) => safe(() => core.comments.listComments(args.postVersionId))(),
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
      description: "Render markdown-subset content as it will appear on LinkedIn (Unicode bold/italic).",
      inputSchema: { contentMarkdown: z.string() },
    },
    (args) => safe(async () => ({ preview: toLinkedInPreview(args.contentMarkdown) }))(),
  );

  return server;
}
