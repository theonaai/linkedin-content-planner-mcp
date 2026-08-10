/**
 * Workspace binding for MCP OAuth grants — mirrors aidl-002's own org-binding pattern (see the
 * linkedin-planner auth plan). The user picks a workspace on the consent screen when they
 * belong to more than one; every access token minted off that grant then carries it as the
 * `workspace_id` claim (see provider.ts :: extraTokenClaims), so the resource server can
 * attribute tool calls without a DB round-trip per request.
 */
import { eq } from "drizzle-orm";
import { mcpOauthGrant } from "@linkedin-planner/db";
import { getOAuthDb } from "./db.js";

export async function setGrantWorkspace(grantId: string, workspaceId: string): Promise<void> {
  const db = getOAuthDb();
  await db.update(mcpOauthGrant).set({ workspaceId }).where(eq(mcpOauthGrant.id, grantId));
}

/** The workspace a grant is bound to, or null for grants with no binding — tokens then need a
 * fallback at attribution time (see mcp/route.ts). */
export async function getGrantWorkspace(grantId: string): Promise<string | null> {
  const db = getOAuthDb();
  const [row] = await db
    .select({ workspaceId: mcpOauthGrant.workspaceId })
    .from(mcpOauthGrant)
    .where(eq(mcpOauthGrant.id, grantId))
    .limit(1);
  return row?.workspaceId ?? null;
}
