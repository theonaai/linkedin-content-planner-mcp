import type { FastifyInstance } from "fastify";
import { type CoreServices, addCommentInputSchema, resolveCommentInputSchema } from "@linkedin-planner/core";

export function registerCommentRoutes(app: FastifyInstance, core: CoreServices) {
  // Post-level, not version-level: comments carry forward across versions wherever their
  // anchored text is unchanged (see packages/core's listCommentsForLatestVersion), so the
  // UI needs the full post's comment history, not just whatever is on one version's id.
  app.get("/api/posts/:id/comments", async (request) => {
    const { id } = request.params as { id: string };
    return core.comments.listCommentsForLatestVersion(id);
  });

  app.post("/api/versions/:versionId/comments", async (request) => {
    const { versionId } = request.params as { versionId: string };
    const input = addCommentInputSchema.parse(request.body);
    return core.comments.addComment({ postVersionId: versionId, ...input });
  });

  app.patch("/api/comments/:id/resolve", async (request) => {
    const { id } = request.params as { id: string };
    const input = resolveCommentInputSchema.parse(request.body);
    return core.comments.resolveComment({ commentId: id, resolved: input.resolved });
  });
}
