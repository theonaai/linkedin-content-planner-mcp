import { eq, asc, desc } from "drizzle-orm";
import { postVersions, type Db } from "@linkedin-planner/db";
import { NotFoundError, ValidationError } from "../errors.js";
import { diffContent, type DiffOp } from "../diff.js";

function findOccurrences(content: string, needle: string): number[] {
  const offsets: number[] = [];
  let idx = content.indexOf(needle);
  while (idx !== -1) {
    offsets.push(idx);
    idx = content.indexOf(needle, idx + 1);
  }
  return offsets;
}

function lineNumberAt(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

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

    /** Targeted edit — replaces exactly one occurrence of oldStr with newStr in the latest
     * version's content and creates a new version, rather than requiring the caller to
     * reproduce the whole draft. Mirrors Anthropic's own str_replace-style editing tools
     * (computer-use's text editor, the memory tool): oldStr must match exactly once —
     * zero matches or an ambiguous (>1) match both fail with an error specific enough for
     * an agent to correct itself, including line numbers when ambiguous. This matters more
     * as content gets longer (a full Substack article), where resending the whole draft to
     * fix one sentence is expensive and risks silently altering unrelated paragraphs — but
     * it's just as usable on a short LinkedIn post. */
    async strReplaceContent(params: { postId: string; oldStr: string; newStr: string; authorId?: string }) {
      if (params.oldStr.length === 0) {
        throw new ValidationError("oldStr must not be empty.");
      }
      const latest = await getLatestVersion(params.postId);
      const occurrences = findOccurrences(latest.contentMarkdown, params.oldStr);

      if (occurrences.length === 0) {
        throw new ValidationError(
          `No replacement made: oldStr ${JSON.stringify(params.oldStr)} did not appear verbatim in the post's current content.`,
        );
      }
      if (occurrences.length > 1) {
        const lines = occurrences.map((offset) => lineNumberAt(latest.contentMarkdown, offset));
        throw new ValidationError(
          `No replacement made: oldStr ${JSON.stringify(params.oldStr)} is not unique — found ${occurrences.length} occurrences at line(s) ${lines.join(", ")}. Include more surrounding context to make it unique.`,
        );
      }

      const offset = occurrences[0];
      const newContent =
        latest.contentMarkdown.slice(0, offset) +
        params.newStr +
        latest.contentMarkdown.slice(offset + params.oldStr.length);

      const [version] = await db
        .insert(postVersions)
        .values({
          postId: params.postId,
          contentMarkdown: newContent,
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
