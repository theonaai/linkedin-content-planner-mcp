// The workspace a request should operate on, when the caller belongs to more than one — sent
// as the x-workspace-id header (see apps/server/src/auth/authorize.ts::resolveCallerWorkspace).
// Most users only ever have their personal workspace, so this stays unset for them.
const STORAGE_KEY = "planner_active_workspace_id";

export function getActiveWorkspaceId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveWorkspaceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}
