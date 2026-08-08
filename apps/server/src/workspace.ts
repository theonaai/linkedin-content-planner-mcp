import { workspaces, type Db } from "@linkedin-planner/db";

/**
 * v1 local mode has no auth and no workspace switcher — every request operates
 * against a single implicit workspace, created on first boot if missing.
 */
export async function ensureDefaultWorkspace(db: Db): Promise<string> {
  const [existing] = await db.select().from(workspaces).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(workspaces).values({ name: "Default Workspace" }).returning();
  return created.id;
}
