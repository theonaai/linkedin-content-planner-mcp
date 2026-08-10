import type { FastifyInstance } from "fastify";
import {
  type CoreServices,
  updateContentInputSchema,
  strReplaceContentInputSchema,
  revertToVersionInputSchema,
  getVersionDiffInputSchema,
} from "@linkedin-planner/core";

export function registerVersionRoutes(app: FastifyInstance, core: CoreServices) {
  app.get("/api/posts/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    return core.versions.listVersions(id);
  });

  app.post("/api/posts/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    const input = updateContentInputSchema.parse(request.body);
    return core.versions.updatePostContent({ postId: id, contentMarkdown: input.contentMarkdown });
  });

  app.post("/api/posts/:id/versions/replace", async (request) => {
    const { id } = request.params as { id: string };
    const input = strReplaceContentInputSchema.parse(request.body);
    return core.versions.strReplaceContent({ postId: id, oldStr: input.oldStr, newStr: input.newStr });
  });

  app.post("/api/posts/:id/versions/revert", async (request) => {
    const { id } = request.params as { id: string };
    const input = revertToVersionInputSchema.parse(request.body);
    return core.versions.revertToVersion({ postId: id, versionId: input.versionId });
  });

  app.get("/api/versions/diff", async (request) => {
    const input = getVersionDiffInputSchema.parse(request.query);
    return core.versions.getVersionDiff(input);
  });
}
