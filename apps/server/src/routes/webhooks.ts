import type { FastifyInstance } from "fastify";
import {
  type CoreServices,
  createWebhookInputSchema,
  updateWebhookInputSchema,
} from "@linkedin-planner/core";

export function registerWebhookRoutes(app: FastifyInstance, core: CoreServices, workspaceId: string) {
  app.post("/api/webhooks", async (request, reply) => {
    const input = createWebhookInputSchema.parse(request.body);
    const webhook = await core.webhooks.createWebhook({ workspaceId, ...input });
    return reply.code(201).send(webhook);
  });

  app.get("/api/webhooks", async () => {
    return core.webhooks.listWebhooks(workspaceId);
  });

  app.get("/api/webhooks/:id", async (request) => {
    const { id } = request.params as { id: string };
    return core.webhooks.getWebhook(id);
  });

  app.patch("/api/webhooks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = updateWebhookInputSchema.parse(request.body);
    return core.webhooks.updateWebhook({ webhookId: id, ...input });
  });

  app.delete("/api/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await core.webhooks.deleteWebhook(id);
    return reply.code(204).send();
  });

  app.get("/api/webhooks/:id/deliveries", async (request) => {
    const { id } = request.params as { id: string };
    return core.webhooks.listDeliveries(id);
  });
}
