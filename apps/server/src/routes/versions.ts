import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type CoreServices,
  updateContentInputSchema,
  strReplaceContentInputSchema,
  revertToVersionInputSchema,
  getVersionDiffInputSchema,
} from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { requireResourceAccess } from "../auth/authorize.js";

export function registerVersionRoutes(app: FastifyInstance, core: CoreServices, auth: AuthEnv | { enabled: false }) {
  async function checkPostAccess(request: FastifyRequest, postId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolvePostWorkspace(postId));
  }

  async function checkVersionAccess(request: FastifyRequest, versionId: string): Promise<void> {
    if (!auth.enabled) return;
    await requireResourceAccess(request, core, auth, () => core.authz.resolveVersionWorkspace(versionId));
  }

  app.get("/api/posts/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    return core.versions.listVersions(id);
  });

  app.post("/api/posts/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    const input = updateContentInputSchema.parse(request.body);
    return core.versions.updatePostContent({ postId: id, contentMarkdown: input.contentMarkdown });
  });

  app.post("/api/posts/:id/versions/replace", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    const input = strReplaceContentInputSchema.parse(request.body);
    return core.versions.strReplaceContent({ postId: id, oldStr: input.oldStr, newStr: input.newStr });
  });

  app.post("/api/posts/:id/versions/revert", async (request) => {
    const { id } = request.params as { id: string };
    await checkPostAccess(request, id);
    const input = revertToVersionInputSchema.parse(request.body);
    return core.versions.revertToVersion({ postId: id, versionId: input.versionId });
  });

  app.get("/api/versions/diff", async (request) => {
    const input = getVersionDiffInputSchema.parse(request.query);
    // Both versions must belong to a workspace the caller can access — checking versionIdA is
    // enough in practice (diffing across two different posts isn't a real use case the UI/MCP
    // ever constructs), but checking both costs one extra indexed lookup and closes the gap
    // for a caller who guesses a stranger's versionIdB.
    await checkVersionAccess(request, input.versionIdA);
    await checkVersionAccess(request, input.versionIdB);
    return core.versions.getVersionDiff(input);
  });
}
