import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createDb, workspaces, users, memberships, type Db } from "@linkedin-planner/db";
import { eq } from "drizzle-orm";
import { createCoreServices, type CoreServices } from "../context.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { InvalidStateTransitionError } from "../stateMachine.js";
import { MAX_ATTACHMENT_BYTES, MAX_FILENAME_LENGTH } from "../limits.js";
import type { StorageAdapter } from "../storage.js";

async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("waitFor: timed out");
}

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

  it("rejects an attachment over the size limit before it ever reaches storage", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "oversized attachment test" });
    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1);

    await expect(
      core.attachments.attachFile({ postId: post.id, filename: "huge.bin", mimeType: "application/octet-stream", data: oversized }),
    ).rejects.toThrow(ValidationError);
    expect(await core.attachments.listAttachments(post.id)).toHaveLength(0);
  });

  it("rejects an attachment with a filename over the length limit", async () => {
    const post = await core.posts.createPost({ workspaceId, initialContent: "long filename test" });

    await expect(
      core.attachments.attachFile({
        postId: post.id,
        filename: `${"a".repeat(MAX_FILENAME_LENGTH + 1)}.txt`,
        mimeType: "text/plain",
        data: Buffer.from("small"),
      }),
    ).rejects.toThrow(ValidationError);
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

  it("creates, updates, and deletes a webhook", async () => {
    const webhook = await core.webhooks.createWebhook({
      workspaceId,
      url: "https://example.com/hooks/planner",
      events: ["post.created", "post.deleted"],
      secret: "shh",
    });
    expect(webhook.active).toBe(true);
    expect(await core.webhooks.listWebhooks(workspaceId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: webhook.id })]),
    );

    const paused = await core.webhooks.updateWebhook({ webhookId: webhook.id, active: false });
    expect(paused.active).toBe(false);

    await core.webhooks.deleteWebhook(webhook.id);
    await expect(core.webhooks.getWebhook(webhook.id)).rejects.toThrow(NotFoundError);
  });

  describe("webhook dispatch", () => {
    let server: Server;
    let baseUrl: string;
    let received: { event: string; payload: unknown; signature: string | undefined }[];

    beforeAll(async () => {
      received = [];
      server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          received.push({
            event: body.event,
            payload: body.payload,
            signature: req.headers["x-webhook-signature"] as string | undefined,
          });
          res.writeHead(200).end("ok");
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("expected a bound TCP address");
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("delivers a subscribed event, signed with the webhook's secret, and logs the delivery", async () => {
      received.length = 0;
      const secret = "top-secret";
      const webhook = await core.webhooks.createWebhook({
        workspaceId,
        url: baseUrl,
        events: ["post.created"],
        secret,
      });

      const post = await core.posts.createPost({ workspaceId, initialContent: "webhook test post" });

      const delivery = await waitFor(async () => {
        const rows = await core.webhooks.listDeliveries(webhook.id);
        return rows.find((r) => r.event === "post.created");
      });
      expect(delivery.success).toBe(true);
      expect(delivery.responseStatus).toBe(200);
      expect((delivery.payload as { postId: string }).postId).toBe(post.id);

      const hit = received.find((r) => r.event === "post.created");
      expect(hit).toBeDefined();
      expect((hit!.payload as { postId: string }).postId).toBe(post.id);
      // The signature covers the exact (timestamp-dependent) request body, so just assert
      // it's present and shaped like our sha256 hex-digest scheme.
      expect(hit!.signature).toMatch(/^sha256=[0-9a-f]{64}$/);

      await core.webhooks.deleteWebhook(webhook.id);
    });

    it("does not deliver events the webhook isn't subscribed to", async () => {
      received.length = 0;
      const webhook = await core.webhooks.createWebhook({
        workspaceId,
        url: baseUrl,
        events: ["post.deleted"],
      });

      const post = await core.posts.createPost({ workspaceId, initialContent: "unsubscribed event test" });
      // No post.created delivery should ever show up for this webhook — give the (absent)
      // async dispatch a moment to have fired before asserting its absence.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await core.webhooks.listDeliveries(webhook.id)).toHaveLength(0);

      await core.posts.deletePost(post.id);
      const delivery = await waitFor(async () => {
        const rows = await core.webhooks.listDeliveries(webhook.id);
        return rows.find((r) => r.event === "post.deleted");
      });
      expect(delivery.success).toBe(true);

      await core.webhooks.deleteWebhook(webhook.id);
    });

    it("does not deliver to a paused webhook", async () => {
      received.length = 0;
      const webhook = await core.webhooks.createWebhook({
        workspaceId,
        url: baseUrl,
        events: ["post.created"],
      });
      await core.webhooks.updateWebhook({ webhookId: webhook.id, active: false });

      await core.posts.createPost({ workspaceId, initialContent: "paused webhook test" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await core.webhooks.listDeliveries(webhook.id)).toHaveLength(0);

      await core.webhooks.deleteWebhook(webhook.id);
    });

    it("logs a failed delivery when the receiver is unreachable, without throwing", async () => {
      const webhook = await core.webhooks.createWebhook({
        workspaceId,
        url: "http://127.0.0.1:1",
        events: ["post.created"],
      });

      await core.posts.createPost({ workspaceId, initialContent: "unreachable webhook test" });

      const delivery = await waitFor(async () => {
        const rows = await core.webhooks.listDeliveries(webhook.id);
        return rows.find((r) => r.event === "post.created");
      }, 8000);
      expect(delivery.success).toBe(false);
      expect(delivery.error).toBeTruthy();

      await core.webhooks.deleteWebhook(webhook.id);
    });
  });

  describe("user provisioning", () => {
    async function cleanup(userId: string, workspaceId: string) {
      await db.delete(memberships).where(eq(memberships.userId, userId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(users).where(eq(users.id, userId));
    }

    it("provisions a personal workspace on first login and reuses it on repeat logins", async () => {
      const theonaUserId = `theona-test-${randomUUID()}`;
      const user1 = await core.users.findOrCreateUser({ theonaUserId, email: "ghostwriter@example.com" });
      expect(user1.theonaUserId).toBe(theonaUserId);

      const memberships1 = await core.users.listMemberships(user1.id);
      expect(memberships1).toHaveLength(1);
      expect(memberships1[0].role).toBe("owner");

      // Logging in again must not create a second user or a second workspace.
      const user2 = await core.users.findOrCreateUser({ theonaUserId, email: "ghostwriter@example.com" });
      expect(user2.id).toBe(user1.id);
      const memberships2 = await core.users.listMemberships(user1.id);
      expect(memberships2).toHaveLength(1);
      expect(memberships2[0].workspaceId).toBe(memberships1[0].workspaceId);

      await core.users.assertMembership(user1.id, memberships1[0].workspaceId);
      await expect(
        core.users.assertMembership(user1.id, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);

      await cleanup(user1.id, memberships1[0].workspaceId);
    });

    it("keeps the cached email in sync when it changes upstream", async () => {
      const theonaUserId = `theona-test-${randomUUID()}`;
      const created = await core.users.findOrCreateUser({ theonaUserId, email: "old@example.com" });
      const updated = await core.users.findOrCreateUser({ theonaUserId, email: "new@example.com" });
      expect(updated.id).toBe(created.id);
      expect(updated.email).toBe("new@example.com");

      const membershipRows = await core.users.listMemberships(created.id);
      await cleanup(created.id, membershipRows[0].workspaceId);
    });
  });

  describe("authz workspace resolvers", () => {
    it("resolves the owning workspace for a post, version, comment, and attachment", async () => {
      const post = await core.posts.createPost({ workspaceId, initialContent: "authz test post" });
      const version = await core.versions.getLatestVersion(post.id);
      const comment = await core.comments.addComment({ postVersionId: version.id, body: "authz test comment" });
      const attachment = await core.attachments.attachFile({
        postId: post.id,
        filename: "authz-test.txt",
        mimeType: "text/plain",
        data: Buffer.from("x"),
      });

      expect(await core.authz.resolvePostWorkspace(post.id)).toBe(workspaceId);
      expect(await core.authz.resolveVersionWorkspace(version.id)).toBe(workspaceId);
      expect(await core.authz.resolveCommentWorkspace(comment.id)).toBe(workspaceId);
      expect(await core.authz.resolveAttachmentWorkspace(attachment.id)).toBe(workspaceId);

      await core.attachments.deleteAttachment(attachment.id);
      await core.posts.deletePost(post.id);
    });

    it("resolves a review's owning workspace", async () => {
      const post = await core.posts.createPost({ workspaceId, initialContent: "authz review test" });
      await core.posts.setPostState({ postId: post.id, toState: "todo" });
      await core.posts.setPostState({ postId: post.id, toState: "in_progress" });
      await core.posts.setPostState({ postId: post.id, toState: "in_review" });
      const review = await core.reviews.submitReview({ postId: post.id, decision: "approved" });

      expect(await core.authz.resolveReviewWorkspace(review.id)).toBe(workspaceId);

      await core.posts.deletePost(post.id);
    });

    it("throws NotFoundError for every resolver when given a nonexistent id", async () => {
      const bogusId = "00000000-0000-0000-0000-000000000000";
      await expect(core.authz.resolvePostWorkspace(bogusId)).rejects.toThrow(NotFoundError);
      await expect(core.authz.resolveVersionWorkspace(bogusId)).rejects.toThrow(NotFoundError);
      await expect(core.authz.resolveCommentWorkspace(bogusId)).rejects.toThrow(NotFoundError);
      await expect(core.authz.resolveReviewWorkspace(bogusId)).rejects.toThrow(NotFoundError);
      await expect(core.authz.resolveAttachmentWorkspace(bogusId)).rejects.toThrow(NotFoundError);
      await expect(core.authz.resolveWebhookWorkspace(bogusId)).rejects.toThrow(NotFoundError);
    });

    it("resolves a webhook's owning workspace", async () => {
      const webhook = await core.webhooks.createWebhook({
        workspaceId,
        url: "https://example.com/hook",
        events: ["post.created"],
      });

      expect(await core.authz.resolveWebhookWorkspace(webhook.id)).toBe(workspaceId);

      await core.webhooks.deleteWebhook(webhook.id);
    });
  });

  describe("workspace invites", () => {
    async function cleanupUser(userId: string, workspaceId: string) {
      await db.delete(memberships).where(eq(memberships.userId, userId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(users).where(eq(users.id, userId));
    }

    it("turns a pending invite into a membership on login, then clears it", async () => {
      const inviter = await core.users.findOrCreateUser({
        theonaUserId: `theona-inviter-${randomUUID()}`,
        email: "inviter@example.com",
      });
      const inviterMemberships = await core.users.listMemberships(inviter.id);
      const inviterWorkspaceId = inviterMemberships[0].workspaceId;

      const email = `ghostwriter-${randomUUID()}@example.com`;
      const invite = await core.invites.createInvite({
        workspaceId: inviterWorkspaceId,
        email,
        role: "member",
        invitedByUserId: inviter.id,
      });
      expect(invite.role).toBe("member");
      expect(await core.invites.listInvites(inviterWorkspaceId)).toHaveLength(1);

      // The invitee logs in for the first time — findOrCreateUser gives them their own
      // personal workspace, and consumePendingInvites should ALSO add them to the inviter's.
      const invitee = await core.users.findOrCreateUser({ theonaUserId: `theona-invitee-${randomUUID()}`, email });
      await core.invites.consumePendingInvites(invitee.id, email);

      const inviteeMemberships = await core.users.listMemberships(invitee.id);
      expect(inviteeMemberships).toHaveLength(2); // personal workspace + the invited one
      expect(inviteeMemberships.map((m) => m.workspaceId)).toContain(inviterWorkspaceId);
      const invitedMembership = inviteeMemberships.find((m) => m.workspaceId === inviterWorkspaceId)!;
      expect(invitedMembership.role).toBe("member");

      // Consumed — the invite row is gone, and members list reflects the new member.
      expect(await core.invites.listInvites(inviterWorkspaceId)).toHaveLength(0);
      const members = await core.users.listMembers(inviterWorkspaceId);
      expect(members.map((m) => m.email)).toEqual(expect.arrayContaining(["inviter@example.com", email]));

      const inviteeWorkspaceId = inviteeMemberships.find((m) => m.workspaceId !== inviterWorkspaceId)!.workspaceId;
      await cleanupUser(invitee.id, inviteeWorkspaceId);
      await db.delete(memberships).where(eq(memberships.workspaceId, inviterWorkspaceId));
      await cleanupUser(inviter.id, inviterWorkspaceId);
    });

    it("refreshes an existing pending invite instead of erroring on re-invite", async () => {
      const owner = await core.users.findOrCreateUser({
        theonaUserId: `theona-owner-${randomUUID()}`,
        email: "owner2@example.com",
      });
      const workspaceId = (await core.users.listMemberships(owner.id))[0].workspaceId;
      const email = `reinvite-${randomUUID()}@example.com`;

      await core.invites.createInvite({ workspaceId, email, role: "member", invitedByUserId: owner.id });
      const refreshed = await core.invites.createInvite({ workspaceId, email, role: "owner", invitedByUserId: owner.id });
      expect(refreshed.role).toBe("owner");

      const invites = await core.invites.listInvites(workspaceId);
      expect(invites).toHaveLength(1); // refreshed, not duplicated

      await cleanupUser(owner.id, workspaceId);
    });

    it("rejects inviting someone already a member", async () => {
      const owner = await core.users.findOrCreateUser({
        theonaUserId: `theona-owner3-${randomUUID()}`,
        email: "owner3@example.com",
      });
      const workspaceId = (await core.users.listMemberships(owner.id))[0].workspaceId;

      await expect(
        core.invites.createInvite({ workspaceId, email: "owner3@example.com", invitedByUserId: owner.id }),
      ).rejects.toThrow(ValidationError);

      await cleanupUser(owner.id, workspaceId);
    });

    it("revokes a pending invite", async () => {
      const owner = await core.users.findOrCreateUser({
        theonaUserId: `theona-owner4-${randomUUID()}`,
        email: "owner4@example.com",
      });
      const workspaceId = (await core.users.listMemberships(owner.id))[0].workspaceId;
      const invite = await core.invites.createInvite({
        workspaceId,
        email: "revokeme@example.com",
        invitedByUserId: owner.id,
      });

      await core.invites.revokeInvite(invite.id);
      expect(await core.invites.listInvites(workspaceId)).toHaveLength(0);
      await expect(core.invites.revokeInvite(invite.id)).rejects.toThrow(NotFoundError);

      await cleanupUser(owner.id, workspaceId);
    });

    it("is a no-op when a login has no pending invites", async () => {
      const user = await core.users.findOrCreateUser({
        theonaUserId: `theona-noinvite-${randomUUID()}`,
        email: `noinvite-${randomUUID()}@example.com`,
      });
      // Should not throw, and should not add any extra membership.
      await core.invites.consumePendingInvites(user.id, user.email);
      expect(await core.users.listMemberships(user.id)).toHaveLength(1);

      const workspaceId = (await core.users.listMemberships(user.id))[0].workspaceId;
      await cleanupUser(user.id, workspaceId);
    });
  });
});
