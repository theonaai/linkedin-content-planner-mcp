import type { FastifyInstance, FastifyRequest } from "fastify";
import { type CoreServices, submitReviewInputSchema } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";

export function registerReviewRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv | { enabled: false }) {
  async function checkPostAccess(request: FastifyRequest, postId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolvePostWorkspace(postId));
  }

  app.post("/api/posts/:id/reviews", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    const input = submitReviewInputSchema.parse(request.body);
    return core.reviews.submitReview({ postId: id, decision: input.decision, body: input.body });
  });

  app.get("/api/posts/:id/reviews", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    return core.reviews.listReviews(id);
  });
}
