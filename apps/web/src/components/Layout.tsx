import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
  }`;

function AccountControls() {
  const { status, activeWorkspaceId, setActiveWorkspaceId, signOut } = useAuth();
  if (status.kind !== "authenticated") return null;

  return (
    <div className="flex items-center gap-2">
      {status.memberships.length > 1 && (
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(e) => setActiveWorkspaceId(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
        >
          {status.memberships.map((m) => (
            <option key={m.workspaceId} value={m.workspaceId}>
              {m.workspaceName}
            </option>
          ))}
        </select>
      )}
      <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
        Sign out
      </button>
    </div>
  );
}

export function Layout() {
  const { status } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-gray-900">LinkedIn Content Planner</span>
            <nav className="flex gap-1">
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
          </div>
          <AccountControls />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
