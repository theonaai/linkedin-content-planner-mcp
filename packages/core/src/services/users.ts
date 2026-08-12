import { eq, and } from "drizzle-orm";
import { users, workspaces, memberships, type Db } from "@linkedin-planner/db";
import { NotFoundError, ValidationError } from "../errors.js";
import type { WorkspaceRole } from "../schemas.js";

export function createUserService(db: Db) {
  async function findByTheonaId(theonaUserId: string) {
    const [row] = await db.select().from(users).where(eq(users.theonaUserId, theonaUserId)).limit(1);
    return row ?? null;
  }

  /** Creates a workspace with `ownerUserId` as its sole owner member. Shared by first-login
   * provisioning and the explicit "create a new team" action — same shape either way. */
  async function createWorkspace(ownerUserId: string, name: string) {
    const [workspace] = await db.insert(workspaces).values({ name }).returning();
    await db.insert(memberships).values({ workspaceId: workspace.id, userId: ownerUserId, role: "owner" });
    return workspace;
  }

  /** Identity is federated from Theona's OAuth AS — there's no local signup step, so the first
   * successful Theona login IS the signup. Lazily provisions a personal workspace + owner
   * membership (mirroring aidl-002's "personal org" pattern) so a brand-new user always has
   * somewhere to work immediately, with no separate onboarding flow. */
  async function findOrCreateUser(params: { theonaUserId: string; email: string }) {
    const existing = await findByTheonaId(params.theonaUserId);
    if (existing) {
      if (existing.email === params.email) return existing;
      // Keep the cached email in sync in case it changed on the Theona side.
      const [updated] = await db
        .update(users)
        .set({ email: params.email })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }

    const [user] = await db
      .insert(users)
      .values({ theonaUserId: params.theonaUserId, email: params.email })
      .returning();

    await createWorkspace(user.id, `${params.email}'s workspace`);

    return user;
  }

  async function listMemberships(userId: string) {
    return db
      .select({ workspaceId: workspaces.id, workspaceName: workspaces.name, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
      .where(eq(memberships.userId, userId));
  }

  /** Server-side authorization check — used by both REST (workspace path/header) and the MCP
   * resource server (workspaceId claim in the bearer token) so neither surface can be tricked
   * into operating on a workspace the caller doesn't belong to. */
  async function assertMembership(userId: string, workspaceId: string) {
    const [row] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
      .limit(1);
    if (!row) throw new NotFoundError("Workspace membership", workspaceId);
  }

  /** The people who can currently see this workspace — for a "who's on this workspace" team
   * view alongside pending invites (core.invites.listInvites). */
  async function listMembers(workspaceId: string) {
    return db
      .select({ userId: users.id, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, workspaceId));
  }

  async function countOwners(workspaceId: string): Promise<number> {
    const rows = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
    return rows.length;
  }

  async function getMembership(workspaceId: string, userId: string) {
    const [row] = await db
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .limit(1);
    if (!row) throw new NotFoundError("Membership", userId);
    return row;
  }

  /** Demoting the last owner would leave the workspace with nobody able to manage it (invite,
   * remove, or promote anyone else back) — block it rather than let a workspace get stuck. */
  async function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    const membership = await getMembership(workspaceId, userId);
    if (membership.role === "owner" && role !== "owner" && (await countOwners(workspaceId)) <= 1) {
      throw new ValidationError("Workspace must have at least one owner — promote someone else first.");
    }
    const [updated] = await db
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .returning();
    return updated;
  }

  /** Same last-owner guard as updateMemberRole — removing the last owner is equally a dead end. */
  async function removeMember(workspaceId: string, userId: string) {
    const membership = await getMembership(workspaceId, userId);
    if (membership.role === "owner" && (await countOwners(workspaceId)) <= 1) {
      throw new ValidationError("Workspace must have at least one owner — promote someone else before removing them.");
    }
    await db.delete(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  }

  return {
    findByTheonaId,
    findOrCreateUser,
    createWorkspace,
    listMemberships,
    assertMembership,
    listMembers,
    updateMemberRole,
    removeMember,
  };
}

export type UserService = ReturnType<typeof createUserService>;
