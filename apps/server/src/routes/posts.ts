import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type CoreServices,
  createPostInputSchema,
  listPostsInputSchema,
  setPostStateInputSchema,
  setPostDateInputSchema,
} from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { resolveCallerWorkspace, requireResourceAccess } from "../auth/authorize.js";

export function registerPostRoutes(
  app: FastifyInstance,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  defaultWorkspaceId: string,
) {
  async function resolveWorkspace(request: FastifyRequest): Promise<string> {
    if (!auth.enabled) return defaultWorkspaceId;
    return (await resolveCallerWorkspace(request, core, auth)).workspaceId;
  }

  async function checkAccess(request: FastifyRequest, postId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolvePostWorkspace(postId));
  }

  app.post("/api/posts", async (request) => {
    const workspaceId = await resolveWorkspace(request);
    const input = createPostInputSchema.parse(request.body ?? {});
    return core.posts.createPost({ workspaceId, ...input });
  });

  app.get("/api/posts", async (request) => {
    const workspaceId = await resolveWorkspace(request);
    const query = request.query as Record<string, unknown>;
    const states = query.state ? (Array.isArray(query.state) ? query.state : [query.state]) : undefined;
    const input = listPostsInputSchema.parse({
      states,
      scheduledBefore: query.scheduledBefore,
      scheduledAfter: query.scheduledAfter,
      platform: query.platform,
    });
    return core.posts.listPosts({ workspaceId, ...input });
  });

  app.get("/api/posts/:id", async (request) => {
    const { id } = request.params as { id: string };
    await checkAccess(request, id);
    return core.posts.getPost(id);
  });

  app.patch("/api/posts/:id/state", async (request) => {
    const { id } = request.params as { id: string };
    await checkAccess(request, id);
    const input = setPostStateInputSchema.parse(request.body);
    return core.posts.setPostState({ postId: id, toState: input.toState });
  });

  app.patch("/api/posts/:id/date", async (request) => {
    const { id } = request.params as { id: string };
    await checkAccess(request, id);
    const input = setPostDateInputSchema.parse(request.body);
    return core.posts.setPostDate({ postId: id, scheduledDate: input.scheduledDate });
  });

  app.delete("/api/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await checkAccess(request, id);
    await core.posts.deletePost(id);
    return reply.code(204).send();
  });
}
