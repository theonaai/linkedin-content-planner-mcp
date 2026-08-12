import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type CoreServices,
  createInviteInputSchema,
  createWorkspaceInputSchema,
  updateMemberRoleInputSchema,
  NotFoundError,
} from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireUserId } from "../auth/authorize.js";

/** Only registered when auth is enabled — inviting someone into a workspace has no meaning in
 * the unauthenticated local-dev single-workspace mode. */
export function registerInviteRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv) {
  async function requireWorkspaceMember(request: FastifyRequest, workspaceId: string): Promise<string> {
    const userId = await requireUserId(request, auth);
    await core.users.assertMembership(userId, workspaceId);
    return userId;
  }

  app.post("/api/workspaces", async (request, reply) => {
    const userId = await requireUserId(request, auth);
    const input = createWorkspaceInputSchema.parse(request.body);
    const workspace = await core.users.createWorkspace(userId, input.name);
    return reply.code(201).send(workspace);
  });

  app.patch("/api/workspaces/:workspaceId", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceMember(request, workspaceId);
    const input = createWorkspaceInputSchema.parse(request.body);
    return core.users.renameWorkspace(workspaceId, input.name);
  });

  app.get("/api/workspaces/:workspaceId/members", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceMember(request, workspaceId);
    return core.users.listMembers(workspaceId);
  });

  app.patch("/api/workspaces/:workspaceId/members/:userId", async (request) => {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string };
    await requireWorkspaceMember(request, workspaceId);
    const input = updateMemberRoleInputSchema.parse(request.body);
    return core.users.updateMemberRole(workspaceId, userId, input.role);
  });

  app.delete("/api/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string };
    await requireWorkspaceMember(request, workspaceId);
    await core.users.removeMember(workspaceId, userId);
    return reply.code(204).send();
  });

  app.post("/api/workspaces/:workspaceId/invites", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const userId = await requireWorkspaceMember(request, workspaceId);
    const input = createInviteInputSchema.parse(request.body);
    const invite = await core.invites.createInvite({
      workspaceId,
      email: input.email,
      role: input.role,
      invitedByUserId: userId,
    });
    return reply.code(201).send(invite);
  });

  app.get("/api/workspaces/:workspaceId/invites", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceMember(request, workspaceId);
    return core.invites.listInvites(workspaceId);
  });

  app.delete("/api/workspaces/:workspaceId/invites/:inviteId", async (request, reply) => {
    const { workspaceId, inviteId } = request.params as { workspaceId: string; inviteId: string };
    await requireWorkspaceMember(request, workspaceId);
    // The workspaceId path param alone doesn't prove this invite belongs to that workspace —
    // confirm it before deleting, so a member of workspace A can't revoke an invite id that
    // actually belongs to workspace B just by guessing/being handed the id.
    const invite = await core.invites.getInvite(inviteId);
    if (invite.workspaceId !== workspaceId) {
      throw new NotFoundError("Invite", inviteId);
    }
    await core.invites.revokeInvite(inviteId);
    return reply.code(204).send();
  });
}
