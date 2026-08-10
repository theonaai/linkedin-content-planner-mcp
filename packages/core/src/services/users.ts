import { eq, and } from "drizzle-orm";
import { users, workspaces, memberships, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";

export function createUserService(db: Db) {
  async function findByTheonaId(theonaUserId: string) {
    const [row] = await db.select().from(users).where(eq(users.theonaUserId, theonaUserId)).limit(1);
    return row ?? null;
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

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: `${params.email}'s workspace` })
      .returning();

    await db.insert(memberships).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

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

  return { findByTheonaId, findOrCreateUser, listMemberships, assertMembership };
}

export type UserService = ReturnType<typeof createUserService>;
