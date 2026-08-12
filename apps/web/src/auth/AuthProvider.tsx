import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getActiveWorkspaceId, setActiveWorkspaceId as persistActiveWorkspaceId } from "../lib/workspace.js";

export interface Membership {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

type AuthStatus =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "unauthenticated" }
  | { kind: "authenticated"; userId: string; memberships: Membership[] };

interface AuthContextValue {
  status: AuthStatus;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  signOut: () => Promise<void>;
  /** Re-fetches memberships from the server — call after creating a workspace or being
   * added to one, so the switcher picks it up without a full page reload. Optionally
   * switches straight to a given workspace id once the refreshed list confirms it exists. */
  refreshMemberships: (switchToWorkspaceId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: "loading" });
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(getActiveWorkspaceId);
  // Guards the mount-time fetch's own cleanup from cancelling later on-demand refreshes.
  const mounted = useRef(true);

  async function loadAuthStatus(switchToWorkspaceId?: string) {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!mounted.current) return;
    if (res.status === 404) return setStatus({ kind: "disabled" });
    if (res.status === 401) return setStatus({ kind: "unauthenticated" });
    if (!res.ok) throw new Error(`Failed to check auth status: ${res.status}`);
    const data = (await res.json()) as { userId: string; memberships: Membership[] };

    // Resolve (and correct, if stale) the active workspace BEFORE flipping status to
    // "authenticated" — both state updates land in the same batch, so no child ever
    // mounts and fires its own data-fetch with a stale/invalid workspaceId still attached
    // to outgoing requests. Doing this correction reactively in a separate effect (the
    // previous approach) raced with children's own mount-time fetches: a workspaceId left
    // over in localStorage from a previous login could outlive its membership (e.g. after
    // switching accounts, or workspace data getting reset) and briefly get sent as
    // x-workspace-id before the correction effect had a chance to run.
    const stored = getActiveWorkspaceId();
    const wantSwitch = switchToWorkspaceId && data.memberships.some((m) => m.workspaceId === switchToWorkspaceId);
    const stillValid = data.memberships.some((m) => m.workspaceId === stored);
    const resolvedWorkspaceId = wantSwitch
      ? switchToWorkspaceId!
      : stillValid
        ? stored
        : (data.memberships[0]?.workspaceId ?? null);
    if (resolvedWorkspaceId && resolvedWorkspaceId !== stored) {
      persistActiveWorkspaceId(resolvedWorkspaceId);
    }
    setActiveWorkspaceIdState(resolvedWorkspaceId);
    setStatus({ kind: "authenticated", userId: data.userId, memberships: data.memberships });
  }

  useEffect(() => {
    mounted.current = true;
    loadAuthStatus().catch(() => {
      if (mounted.current) setStatus({ kind: "unauthenticated" });
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  function setActiveWorkspaceId(id: string) {
    persistActiveWorkspaceId(id);
    setActiveWorkspaceIdState(id);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setStatus({ kind: "unauthenticated" });
  }

  return (
    <AuthContext.Provider
      value={{ status, activeWorkspaceId, setActiveWorkspaceId, signOut, refreshMemberships: loadAuthStatus }}
    >
      {children}
    </AuthContext.Provider>
  );
}
