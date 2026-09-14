import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createDb, memberships, mcpAccessKeys, users, workspaces, type Db } from "@linkedin-planner/db";
import { eq } from "drizzle-orm";
import { createAccessKeyService, MCP_ACCESS_KEY_PREFIX } from "./accessKeys.js";
import { NotFoundError } from "../errors.js";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("access keys (integration)", () => {
  let db: Db;
  let workspaceId: string;
  let ownerId: string;
  let otherUserId: string;

  beforeAll(async () => {
    db = createDb(connectionString!);
    const [workspace] = await db.insert(workspaces).values({ name: `access-keys-${randomUUID()}` }).returning();
    workspaceId = workspace.id;
    const [owner] = await db
      .insert(users)
      .values({ theonaUserId: randomUUID(), email: `${randomUUID()}@example.test` })
      .returning();
    const [other] = await db
      .insert(users)
      .values({ theonaUserId: randomUUID(), email: `${randomUUID()}@example.test` })
      .returning();
    ownerId = owner.id;
    otherUserId = other.id;
    await db.insert(memberships).values({ workspaceId, userId: ownerId });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, ownerId));
    await db.delete(users).where(eq(users.id, otherUserId));
  });

  it("returns the raw key once and stores only its hash", async () => {
    const service = createAccessKeyService(db);

    const created = await service.createAccessKey({ userId: ownerId, workspaceId, label: "Apify" });

    expect(created.accessKey.startsWith(MCP_ACCESS_KEY_PREFIX)).toBe(true);
    const [row] = await db.select().from(mcpAccessKeys).where(eq(mcpAccessKeys.id, created.id));
    expect(row.keyHash).toBe(createHash("sha256").update(created.accessKey).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(created.accessKey);
  });

  it("finds a live key and stops finding it once revoked", async () => {
    const service = createAccessKeyService(db);
    const created = await service.createAccessKey({ userId: ownerId, workspaceId, label: "Apify" });

    await expect(service.findActiveAccessKey(created.accessKey)).resolves.toMatchObject({
      id: created.id,
      userId: ownerId,
      workspaceId,
    });

    await service.revokeAccessKey(ownerId, created.id);

    await expect(service.findActiveAccessKey(created.accessKey)).resolves.toBeNull();
    const listed = await service.listAccessKeys(ownerId, workspaceId);
    expect(listed.map((key) => key.id)).not.toContain(created.id);
  });

  it("does not let another user revoke a key", async () => {
    const service = createAccessKeyService(db);
    const created = await service.createAccessKey({ userId: ownerId, workspaceId, label: "Apify" });

    await expect(service.revokeAccessKey(otherUserId, created.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.findActiveAccessKey(created.accessKey)).resolves.not.toBeNull();
  });

  it("records use at most once an hour", async () => {
    const service = createAccessKeyService(db);
    const created = await service.createAccessKey({ userId: ownerId, workspaceId, label: "Apify" });
    const key = await service.findActiveAccessKey(created.accessKey);

    await service.recordAccessKeyUse(key!);
    const afterFirst = await service.findActiveAccessKey(created.accessKey);
    await service.recordAccessKeyUse(afterFirst!);
    const afterSecond = await service.findActiveAccessKey(created.accessKey);

    expect(afterFirst!.lastUsedAt).not.toBeNull();
    expect(afterSecond!.lastUsedAt).toEqual(afterFirst!.lastUsedAt);
  });
});
