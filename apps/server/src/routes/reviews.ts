import type { FastifyInstance } from "fastify";
import { type CoreServices, submitReviewInputSchema } from "@linkedin-planner/core";

export function registerReviewRoutes(app: FastifyInstance, core: CoreServices) {
  app.post("/api/posts/:id/reviews", async (request) => {
    const { id } = request.params as { id: string };
    const input = submitReviewInputSchema.parse(request.body);
    return core.reviews.submitReview({ postId: id, decision: input.decision, body: input.body });
  });

  app.get("/api/posts/:id/reviews", async (request) => {
    const { id } = request.params as { id: string };
    return core.reviews.listReviews(id);
  });
}
