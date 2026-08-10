import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type CoreServices,
  createWebhookInputSchema,
  updateWebhookInputSchema,
} from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { resolveCallerWorkspace, requireResourceAccess } from "../auth/authorize.js";

export function registerWebhookRoutes(
  app: FastifyInstance,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  defaultWorkspaceId: string,
) {
  async function resolveWorkspace(request: FastifyRequest): Promise<string> {
    if (!auth.enabled) return defaultWorkspaceId;
    return (await resolveCallerWorkspace(request, core, auth)).workspaceId;
  }

  async function checkWebhookAccess(request: FastifyRequest, webhookId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolveWebhookWorkspace(webhookId));
  }

  app.post("/api/webhooks", async (request, reply) => {
    const workspaceId = await resolveWorkspace(request);
    const input = createWebhookInputSchema.parse(request.body);
    const webhook = await core.webhooks.createWebhook({ workspaceId, ...input });
    return reply.code(201).send(webhook);
  });

  app.get("/api/webhooks", async (request) => {
    const workspaceId = await resolveWorkspace(request);
    return core.webhooks.listWebhooks(workspaceId);
  });

  app.get("/api/webhooks/:id", async (request) => {
    const { id } = request.params as { id: string };
    await checkWebhookAccess(request, id);
    return core.webhooks.getWebhook(id);
  });

  app.patch("/api/webhooks/:id", async (request) => {
    const { id } = request.params as { id: string };
    await checkWebhookAccess(request, id);
    const input = updateWebhookInputSchema.parse(request.body);
    return core.webhooks.updateWebhook({ webhookId: id, ...input });
  });

  app.delete("/api/webhooks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkWebhookAccess(request, id);
    await core.webhooks.deleteWebhook(id);
    return reply.code(204).send();
  });

  app.get("/api/webhooks/:id/deliveries", async (request) => {
    const { id } = request.params as { id: string };
    await checkWebhookAccess(request, id);
    return core.webhooks.listDeliveries(id);
  });
}
