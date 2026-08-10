import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, workspaces, type Db } from "@linkedin-planner/db";
import { eq } from "drizzle-orm";
import { createCoreServices, type CoreServices } from "../context.js";
import { NotFoundError, ValidationError } from "../errors.js";
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

  it("blocks submitting for review while a comment on the latest version is unresolved", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "draft" });
    await core.posts.setPostState({ postId: post.id, toState: "todo" });
    await core.posts.setPostState({ postId: post.id, toState: "in_progress" });

    const version = await core.versions.getLatestVersion(post.id);
    const comment = await core.comments.addComment({
      postVersionId: version.id,
      body: "This needs a stronger hook.",
    });

    await expect(core.posts.setPostState({ postId: post.id, toState: "in_review" })).rejects.toThrow(
      /unresolved comment/i,
    );

    // A reply alone shouldn't unblock it — only resolving the thread does.
    await core.comments.addComment({
      postVersionId: version.id,
      body: "Working on it.",
      parentCommentId: comment.id,
    });
    await expect(core.posts.setPostState({ postId: post.id, toState: "in_review" })).rejects.toThrow(
      /unresolved comment/i,
    );

    await core.comments.resolveComment({ commentId: comment.id, resolved: true });
    const current = await core.posts.setPostState({ postId: post.id, toState: "in_review" });
    expect(current.state).toBe("in_review");
  });

  it("carries a comment's anchor forward when its text is unchanged in a later version, and stales it when the text changes", async () => {
    const post = await core.posts.createPost({
      workspaceId,
      initialContent: "Intro line.\n\nHere's why it matters.\n\nClosing line.",
    });
    const v1 = await core.versions.getLatestVersion(post.id);
    const unchangedOffset = v1.contentMarkdown.indexOf("Here's why it matters.");

    const survivor = await core.comments.addComment({
      postVersionId: v1.id,
      body: "Keep this framing.",
      anchorOffset: unchangedOffset,
      anchorLength: "Here's why it matters.".length,
    });
    const introOffset = v1.contentMarkdown.indexOf("Intro line.");
    const casualty = await core.comments.addComment({
      postVersionId: v1.id,
      body: "This opener is weak.",
      anchorOffset: introOffset,
      anchorLength: "Intro line.".length,
    });

    // Edit only the intro; the "why it matters" sentence is untouched.
    await core.versions.updatePostContent({
      postId: post.id,
      contentMarkdown: "A punchier intro.\n\nHere's why it matters.\n\nClosing line.",
    });
    const v2 = await core.versions.getLatestVersion(post.id);

    const resolved = await core.comments.listCommentsForLatestVersion(post.id);
    const survivorResolved = resolved.find((c) => c.id === survivor.id)!;
    const casualtyResolved = resolved.find((c) => c.id === casualty.id)!;

    expect(survivorResolved.anchorStale).toBe(false);
    expect(survivorResolved.resolvedAnchorOffset).toBe(v2.contentMarkdown.indexOf("Here's why it matters."));
    expect(
      v2.contentMarkdown.slice(
        survivorResolved.resolvedAnchorOffset!,
        survivorResolved.resolvedAnchorOffset! + survivorResolved.resolvedAnchorLength!,
      ),
    ).toBe("Here's why it matters.");

    expect(casualtyResolved.anchorStale).toBe(true);
    expect(casualtyResolved.resolvedAnchorOffset).toBeNull();
  });

  it("still blocks review submission for an unresolved comment left on an older version", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "v1 content" });
    await core.posts.setPostState({ postId: post.id, toState: "todo" });
    await core.posts.setPostState({ postId: post.id, toState: "in_progress" });

    const v1 = await core.versions.getLatestVersion(post.id);
    await core.comments.addComment({ postVersionId: v1.id, body: "Fix this before moving on." });

    // Saving a new version must not silently let the old unresolved comment slip past the gate.
    await core.versions.updatePostContent({ postId: post.id, contentMarkdown: "v2 content, unrelated edit" });

    await expect(core.posts.setPostState({ postId: post.id, toState: "in_review" })).rejects.toThrow(
      /unresolved comment/i,
    );
  });

  it("str-replaces a unique substring without touching the rest of the content", async () => {
    const post = await core.posts.createPost({
      workspaceId,
      initialContent: "Intro line.\n\nThe old CTA goes here.\n\nClosing line.",
    });

    const updated = await core.versions.strReplaceContent({
      postId: post.id,
      oldStr: "The old CTA goes here.",
      newStr: "A punchier new CTA.",
    });

    expect(updated.contentMarkdown).toBe("Intro line.\n\nA punchier new CTA.\n\nClosing line.");
    expect(await core.versions.listVersions(post.id)).toHaveLength(2);
  });

  it("rejects a str_replace when oldStr isn't found, with a clear message", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "Some content here." });

    await expect(
      core.versions.strReplaceContent({ postId: post.id, oldStr: "text that is not present", newStr: "x" }),
    ).rejects.toThrow(/did not appear verbatim/i);
  });

  it("rejects an ambiguous str_replace and reports every matching line", async () => {
    const post = await core.posts.createPost({
      workspaceId,
      initialContent: "First: repeat me.\nSecond: repeat me.\nThird: unique.",
    });

    await expect(
      core.versions.strReplaceContent({ postId: post.id, oldStr: "repeat me.", newStr: "x" }),
    ).rejects.toThrow(/not unique.*line\(s\) 1, 2/is);

    // No version should have been created on failure.
    expect(await core.versions.listVersions(post.id)).toHaveLength(1);
  });

  it("deletes a post along with its versions, comments, and attachment files", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "throwaway idea" });
    const version = await core.versions.getLatestVersion(post.id);
    await core.comments.addComment({ postVersionId: version.id, body: "some feedback" });
    const attachment = await core.attachments.attachFile({
      postId: post.id,
      filename: "carousel.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("fake bytes"),
    });

    await core.posts.deletePost(post.id);

    await expect(core.posts.getPost(post.id)).rejects.toThrow(NotFoundError);
    expect(await core.versions.listVersions(post.id)).toHaveLength(0);
    expect(await core.attachments.listAttachments(post.id)).toHaveLength(0);
    // The underlying file should be gone too, not just the DB row.
    await expect(core.attachments.downloadAttachment(attachment.id)).rejects.toThrow();
  });

  it("deleting a nonexistent post throws NotFoundError", async () => {
    await expect(core.posts.deletePost("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      NotFoundError,
    );
  });
});
