import type { FastifyInstance, FastifyRequest } from "fastify";
import { type CoreServices, addCommentInputSchema, resolveCommentInputSchema } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";

export function registerCommentRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv | { enabled: false }) {
  async function checkPostAccess(request: FastifyRequest, postId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolvePostWorkspace(postId));
  }

  async function checkVersionAccess(request: FastifyRequest, versionId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolveVersionWorkspace(versionId));
  }

  async function checkCommentAccess(request: FastifyRequest, commentId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolveCommentWorkspace(commentId));
  }

  // Post-level, not version-level: comments carry forward across versions wherever their
  // anchored text is unchanged (see packages/core's listCommentsForLatestVersion), so the
  // UI needs the full post's comment history, not just whatever is on one version's id.
  app.get("/api/posts/:id/comments", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    return core.comments.listCommentsForLatestVersion(id);
  });

  app.post("/api/versions/:versionId/comments", async (request) => {
    const { versionId } = request.params as { versionId: string };
    await checkVersionAccess(request, versionId);
    const input = addCommentInputSchema.parse(request.body);
    return core.comments.addComment({ postVersionId: versionId, ...input });
  });

  app.patch("/api/comments/:id/resolve", async (request) => {
    const { id } = request.params as { id: string };
    await checkCommentAccess(request, id);
    const input = resolveCommentInputSchema.parse(request.body);
    return core.comments.resolveComment({ commentId: id, resolved: input.resolved });
  });
}
