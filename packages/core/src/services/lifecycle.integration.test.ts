import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, workspaces, type Db } from "@linkedin-planner/db";
import { eq } from "drizzle-orm";
import { createCoreServices, type CoreServices } from "../context.js";
import { ValidationError } from "../errors.js";
import { InvalidStateTransitionError } from "../stateMachine.js";
import type { StorageAdapter } from "../storage.js";

function createInMemoryStorage(): StorageAdapter {
  const files = new Map<string, Buffer>();
  return {
    async save(key, data) {
      files.set(key, data);
    },
    async read(key) {
      const data = files.get(key);
      if (!data) throw new Error(`No such key: ${key}`);
      return data;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("post lifecycle (integration)", () => {
  let db: Db;
  let core: CoreServices;
  let workspaceId: string;

  beforeAll(async () => {
    db = createDb(connectionString!);
    core = createCoreServices(db, createInMemoryStorage());
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "core-integration-test" })
      .returning();
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  it("walks a post from backlog to posted through review", async () => {
    const post = await core.posts.createPost({
      workspaceId,
      initialContent: "idea: launch announcement",
    });
    expect(post.state).toBe("backlog");

    await core.posts.setPostState({ postId: post.id, toState: "todo" });
    await core.posts.setPostState({ postId: post.id, toState: "in_progress" });

    const draft = await core.versions.updatePostContent({
      postId: post.id,
      contentMarkdown: "**Launching today.** Excited to share this.",
    });
    expect(draft.contentMarkdown).toContain("Launching today");

    await core.posts.setPostState({ postId: post.id, toState: "in_review" });

    // Can't skip the review gate directly.
    await expect(core.posts.setPostState({ postId: post.id, toState: "ready" })).rejects.toThrow(
      InvalidStateTransitionError,
    );

    // Requesting changes requires a note.
    await expect(
      core.reviews.submitReview({ postId: post.id, decision: "changes_requested" }),
    ).rejects.toThrow(ValidationError);

    await core.reviews.submitReview({
      postId: post.id,
      decision: "changes_requested",
      body: "Tighten the hook.",
    });
    let current = await core.posts.getPost(post.id);
    expect(current.state).toBe("in_progress");

    await core.versions.updatePostContent({
      postId: post.id,
      contentMarkdown: "**Launching today.** Here's why it matters.",
    });
    await core.posts.setPostState({ postId: post.id, toState: "in_review" });
    await core.reviews.submitReview({ postId: post.id, decision: "approved" });

    current = await core.posts.getPost(post.id);
    expect(current.state).toBe("ready");

    await core.posts.setPostDate({ postId: post.id, scheduledDate: "2026-09-01" });
    await core.posts.setPostState({ postId: post.id, toState: "posted" });
    current = await core.posts.getPost(post.id);
    expect(current.state).toBe("posted");

    const reviews = await core.reviews.listReviews(post.id);
    expect(reviews.map((r) => r.decision)).toEqual(["changes_requested", "approved"]);

    const versions = await core.versions.listVersions(post.id);
    expect(versions).toHaveLength(3);

    const diff = await core.versions.getVersionDiff({
      versionIdA: versions[0].id,
      versionIdB: versions[2].id,
    });
    expect(diff.some((op) => op.type === "add")).toBe(true);

    const reverted = await core.versions.revertToVersion({
      postId: post.id,
      versionId: versions[0].id,
    });
    expect(reverted.contentMarkdown).toBe(versions[0].contentMarkdown);
    expect(await core.versions.listVersions(post.id)).toHaveLength(4);
  });

  it("threads and resolves comments on a version", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "draft" });
    const version = await core.versions.getLatestVersion(post.id);

    const root = await core.comments.addComment({
      postVersionId: version.id,
      body: "Can we cut this line?",
      anchorOffset: 0,
      anchorLength: 5,
    });
    const reply = await core.comments.addComment({
      postVersionId: version.id,
      body: "Done.",
      parentCommentId: root.id,
    });

    const comments = await core.comments.listComments(version.id);
    expect(comments.map((c) => c.id)).toEqual([root.id, reply.id]);

    const resolved = await core.comments.resolveComment({ commentId: root.id, resolved: true });
    expect(resolved.resolved).toBe(true);
  });

  it("attaches, lists, downloads, and deletes a file", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "carousel post" });
    const data = Buffer.from("%PDF-1.4 fake carousel bytes");

    const attachment = await core.attachments.attachFile({
      postId: post.id,
      filename: "carousel.pdf",
      mimeType: "application/pdf",
      data,
    });
    expect(attachment.filename).toBe("carousel.pdf");
    expect(attachment.sizeBytes).toBe(data.length);

    const list = await core.attachments.listAttachments(post.id);
    expect(list.map((a) => a.id)).toEqual([attachment.id]);

    const downloaded = await core.attachments.downloadAttachment(attachment.id);
    expect(downloaded.data.equals(data)).toBe(true);

    await core.attachments.deleteAttachment(attachment.id);
    expect(await core.attachments.listAttachments(post.id)).toHaveLength(0);
  });
});
