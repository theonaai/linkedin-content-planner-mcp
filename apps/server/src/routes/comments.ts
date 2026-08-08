import type { FastifyInstance } from "fastify";
import { type CoreServices, addCommentInputSchema, resolveCommentInputSchema } from "@linkedin-planner/core";

export function registerCommentRoutes(app: FastifyInstance, core: CoreServices) {
  app.get("/api/versions/:versionId/comments", async (request) => {
    const { versionId } = request.params as { versionId: string };
    return core.comments.listComments(versionId);
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
