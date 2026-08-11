export function LoginScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-8 text-center shadow-card">
        <h1 className="text-lg font-semibold text-text-primary">LinkedIn Content Planner</h1>
        <p className="mt-2 text-sm text-text-secondary">Sign in with your Theona account to continue.</p>
        {/* Full page navigation, not a fetch — the server needs to set a cookie and redirect
            through Theona's own login page before landing back here. */}
        <a
          href="/api/auth/login"
          className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Sign in with Theona
        </a>
      </div>
    </div>
  );
}
