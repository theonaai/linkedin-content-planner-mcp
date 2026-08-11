import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-[7px] text-sm ${
    isActive
      ? "border border-[rgba(229,81,43,0.25)] bg-accent-soft font-semibold text-accent-text"
      : "border border-transparent font-medium text-text-secondary hover:text-text-primary"
  }`;

function AccountControls() {
  const { status, activeWorkspaceId, setActiveWorkspaceId, signOut } = useAuth();
  if (status.kind !== "authenticated") return null;

  return (
    <div className="flex items-center gap-3.5">
      {status.memberships.length > 1 && (
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(e) => setActiveWorkspaceId(e.target.value)}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary"
        >
          {status.memberships.map((m) => (
            <option key={m.workspaceId} value={m.workspaceId}>
              {m.workspaceName}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <div className="h-[26px] w-[26px] rounded-full border border-border bg-surface-3" />
      </div>
      <button onClick={signOut} className="text-[13px] text-text-muted hover:text-text-primary">
        Sign out
      </button>
    </div>
  );
}

export function Layout() {
  const { status } = useAuth();
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-[rgba(246,245,243,0.86)] backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1180px] items-center gap-7 px-7 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
              in
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-text-primary">
              LinkedIn Content Planner
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/webhooks" className={linkClass}>
              Webhooks
            </NavLink>
            {status.kind === "authenticated" && (
              <NavLink to="/team" className={linkClass}>
                Team
              </NavLink>
            )}
          </nav>
          <div className="flex-1" />
          <AccountControls />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-7 py-9">
        <Outlet />
      </main>
    </div>
  );
}
