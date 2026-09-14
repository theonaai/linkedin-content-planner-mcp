import type { FastifyInstance } from "fastify";
import { type CoreServices, createAccessKeyInputSchema } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireUserId, resolveCallerWorkspace } from "../auth/authorize.js";

/** Only registered when auth is enabled — without it /mcp takes no credential at all. */
export function registerAccessKeyRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv) {
  app.get("/api/access-keys", async (request) => {
    const { userId, workspaceId } = await resolveCallerWorkspace(request, core, auth);
    return core.accessKeys.listAccessKeys(userId, workspaceId);
  });

  app.post("/api/access-keys", async (request, reply) => {
    const { userId, workspaceId } = await resolveCallerWorkspace(request, core, auth);
    const input = createAccessKeyInputSchema.parse(request.body);
    const created = await core.accessKeys.createAccessKey({ userId, workspaceId, label: input.label });
    return reply.code(201).send(created);
  });

  app.delete("/api/access-keys/:keyId", async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const userId = await requireUserId(request, auth);
    await core.accessKeys.revokeAccessKey(userId, keyId);
    return reply.code(204).send();
  });
}
