import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider.js";
import { LoginScreen } from "./LoginScreen.js";

/** Gates the whole app behind Theona login — except when the server has no AUTH_ENABLED at
 * all, in which case this renders straight through with zero behavior change (today's
 * local-dev experience). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status.kind === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Loading…</div>;
  }
  if (status.kind === "unauthenticated") {
    return <LoginScreen />;
  }
  return <>{children}</>;
}
