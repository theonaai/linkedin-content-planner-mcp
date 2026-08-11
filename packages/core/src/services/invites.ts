import { eq, and } from "drizzle-orm";
import { invites, memberships, users, type Db } from "@linkedin-planner/db";
import { NotFoundError, ValidationError } from "../errors.js";

export function createInviteService(db: Db) {
  async function createInvite(params: {
    workspaceId: string;
    email: string;
    role?: string;
    invitedByUserId: string;
  }) {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, params.email)).limit(1);
    if (existingUser) {
      const [existingMembership] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, params.workspaceId), eq(memberships.userId, existingUser.id)))
        .limit(1);
      if (existingMembership) {
        throw new ValidationError(`${params.email} is already a member of this workspace.`);
      }
    }

    const role = params.role ?? "member";
    // Re-inviting an email that already has a pending invite refreshes it (new inviter, new
    // role, new timestamp) rather than erroring — the unique constraint on
    // (workspaceId, email) exists to prevent duplicate rows, not duplicate invite attempts.
    const [invite] = await db
      .insert(invites)
      .values({ workspaceId: params.workspaceId, email: params.email, role, invitedByUserId: params.invitedByUserId })
      .onConflictDoUpdate({
        target: [invites.workspaceId, invites.email],
        set: { role, invitedByUserId: params.invitedByUserId, createdAt: new Date() },
      })
      .returning();
    return invite;
  }

  async function listInvites(workspaceId: string) {
    return db.select().from(invites).where(eq(invites.workspaceId, workspaceId));
  }

  async function revokeInvite(inviteId: string) {
    const [deleted] = await db.delete(invites).where(eq(invites.id, inviteId)).returning();
    if (!deleted) throw new NotFoundError("Invite", inviteId);
  }

  async function getInvite(inviteId: string) {
    const [row] = await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1);
    if (!row) throw new NotFoundError("Invite", inviteId);
    return row;
  }

  /** Called after every successful login, not just the first — an invite might arrive after
   * the invitee already has an account. Resolves any pending invites matching this email into
   * real memberships, then clears them. */
  async function consumePendingInvites(userId: string, email: string): Promise<void> {
    const pending = await db.select().from(invites).where(eq(invites.email, email));
    if (pending.length === 0) return;

    for (const invite of pending) {
      await db
        .insert(memberships)
        .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
        .onConflictDoNothing();
    }
    await db.delete(invites).where(eq(invites.email, email));
  }

  return { createInvite, listInvites, revokeInvite, getInvite, consumePendingInvites };
}

export type InviteService = ReturnType<typeof createInviteService>;
