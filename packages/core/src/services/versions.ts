import { eq, asc, desc } from "drizzle-orm";
import { postVersions, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";
import { diffContent, type DiffOp } from "../diff.js";

export function createVersionService(db: Db) {
  async function listVersions(postId: string) {
    return db
      .select()
      .from(postVersions)
      .where(eq(postVersions.postId, postId))
      .orderBy(asc(postVersions.createdAt));
  }

  async function getLatestVersion(postId: string) {
    const [version] = await db
      .select()
      .from(postVersions)
      .where(eq(postVersions.postId, postId))
      .orderBy(desc(postVersions.createdAt))
      .limit(1);
    if (!version) throw new NotFoundError("PostVersion for post", postId);
    return version;
  }

  async function getVersion(versionId: string) {
    const [version] = await db.select().from(postVersions).where(eq(postVersions.id, versionId)).limit(1);
    if (!version) throw new NotFoundError("PostVersion", versionId);
    return version;
  }

  return {
    listVersions,
    getLatestVersion,
    getVersion,

    async updatePostContent(params: { postId: string; contentMarkdown: string; authorId?: string }) {
      const [version] = await db
        .insert(postVersions)
        .values({
          postId: params.postId,
          contentMarkdown: params.contentMarkdown,
          authorId: params.authorId ?? null,
        })
        .returning();
      return version;
    },

    async revertToVersion(params: { postId: string; versionId: string; actorId?: string }) {
      const source = await getVersion(params.versionId);
      if (source.postId !== params.postId) {
        throw new NotFoundError("PostVersion", params.versionId);
      }
      const [version] = await db
        .insert(postVersions)
        .values({
          postId: params.postId,
          contentMarkdown: source.contentMarkdown,
          authorId: params.actorId ?? null,
        })
        .returning();
      return version;
    },

    async getVersionDiff(params: { versionIdA: string; versionIdB: string }): Promise<DiffOp[]> {
      const [a, b] = await Promise.all([getVersion(params.versionIdA), getVersion(params.versionIdB)]);
      return diffContent(a.contentMarkdown, b.contentMarkdown);
    },
  };
}

export type VersionService = ReturnType<typeof createVersionService>;
