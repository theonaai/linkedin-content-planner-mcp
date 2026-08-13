import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";
import { StyledSelect } from "./StyledSelect.js";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-[13px] sm:px-4 sm:py-[7px] sm:text-sm ${
    isActive
      ? "border border-[rgba(229,81,43,0.25)] bg-accent-soft font-semibold text-accent-text"
      : "border border-transparent font-medium text-text-secondary hover:text-text-primary"
  }`;

function AccountControls() {
  const { status, activeWorkspaceId, setActiveWorkspaceId, signOut } = useAuth();
  if (status.kind !== "authenticated") return null;

  return (
    <div className="flex items-center gap-2.5 sm:gap-3.5">
      {status.memberships.length > 1 && (
        <div className="hidden max-w-[140px] sm:block">
          <StyledSelect
            compact
            value={activeWorkspaceId ?? ""}
            onChange={(e) => setActiveWorkspaceId(e.target.value)}
          >
            {status.memberships.map((m) => (
              <option key={m.workspaceId} value={m.workspaceId}>
                {m.workspaceName}
              </option>
            ))}
          </StyledSelect>
        </div>
      )}
      <div className="hidden items-center gap-2 sm:flex">
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
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-7 sm:px-7 sm:py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
              in
            </div>
            <span className="hidden text-[15px] font-semibold tracking-tight text-text-primary sm:inline">
              LinkedIn Content Planner
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/connect" className={linkClass}>
              Connect
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
      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-7 sm:py-9">
        <Outlet />
      </main>
    </div>
  );
}
