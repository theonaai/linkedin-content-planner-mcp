import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { mcpAccessKeys, type Db } from "@linkedin-planner/db";
import { NotFoundError } from "../errors.js";

/** Tells an access key from an OAuth JWT without parsing it. */
export const MCP_ACCESS_KEY_PREFIX = "planner_mcp_";

/** `lastUsedAt` is informational; one write an hour per key is enough. */
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

export function isMcpAccessKey(token: string): boolean {
  return token.startsWith(MCP_ACCESS_KEY_PREFIX);
}

function hashAccessKey(accessKey: string): string {
  return createHash("sha256").update(accessKey).digest("hex");
}

export interface ActiveAccessKey {
  id: string;
  userId: string;
  workspaceId: string;
  lastUsedAt: Date | null;
}

/**
 * Long-lived credentials for MCP clients that cannot run the OAuth flow. A key opens /mcp for one
 * workspace as the user who created it; /mcp still re-checks that membership on every request.
 * Only a key's sha256 is stored, so existing keys are listed as metadata and can only be revoked.
 */
export function createAccessKeyService(db: Db) {
  const metadata = {
    id: mcpAccessKeys.id,
    label: mcpAccessKeys.label,
    workspaceId: mcpAccessKeys.workspaceId,
    createdAt: mcpAccessKeys.createdAt,
    lastUsedAt: mcpAccessKeys.lastUsedAt,
  };

  /** Returns the raw key exactly once; only its hash is stored. */
  async function createAccessKey(params: { userId: string; workspaceId: string; label: string }) {
    const accessKey = `${MCP_ACCESS_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const [row] = await db
      .insert(mcpAccessKeys)
      .values({
        userId: params.userId,
        workspaceId: params.workspaceId,
        label: params.label,
        keyHash: hashAccessKey(accessKey),
      })
      .returning(metadata);
    return { ...row, accessKey };
  }

  async function listAccessKeys(userId: string, workspaceId: string) {
    return db
      .select(metadata)
      .from(mcpAccessKeys)
      .where(
        and(
          eq(mcpAccessKeys.userId, userId),
          eq(mcpAccessKeys.workspaceId, workspaceId),
          isNull(mcpAccessKeys.revokedAt),
        ),
      )
      .orderBy(desc(mcpAccessKeys.createdAt));
  }

  /** Keys are personal: only their creator can revoke them. */
  async function revokeAccessKey(userId: string, keyId: string) {
    const [revoked] = await db
      .update(mcpAccessKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpAccessKeys.id, keyId), eq(mcpAccessKeys.userId, userId), isNull(mcpAccessKeys.revokedAt)))
      .returning({ id: mcpAccessKeys.id });
    if (!revoked) throw new NotFoundError("Access key", keyId);
  }

  /** The live key behind a raw bearer value, or null for an unknown or revoked one. A store
   * failure throws rather than answering null, so /mcp can say 503 instead of telling the holder
   * of a working key that it is invalid. */
  async function findActiveAccessKey(accessKey: string): Promise<ActiveAccessKey | null> {
    const [row] = await db
      .select({
        id: mcpAccessKeys.id,
        userId: mcpAccessKeys.userId,
        workspaceId: mcpAccessKeys.workspaceId,
        lastUsedAt: mcpAccessKeys.lastUsedAt,
      })
      .from(mcpAccessKeys)
      .where(and(eq(mcpAccessKeys.keyHash, hashAccessKey(accessKey)), isNull(mcpAccessKeys.revokedAt)))
      .limit(1);
    return row ?? null;
  }

  async function recordAccessKeyUse(key: ActiveAccessKey): Promise<void> {
    if (key.lastUsedAt && Date.now() - key.lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS) return;
    await db.update(mcpAccessKeys).set({ lastUsedAt: new Date() }).where(eq(mcpAccessKeys.id, key.id));
  }

  return { createAccessKey, listAccessKeys, revokeAccessKey, findActiveAccessKey, recordAccessKeyUse };
}

export type AccessKeyService = ReturnType<typeof createAccessKeyService>;
