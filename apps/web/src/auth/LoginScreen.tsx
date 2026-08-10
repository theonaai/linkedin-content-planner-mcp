export function LoginScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">LinkedIn Content Planner</h1>
        <p className="mt-2 text-sm text-gray-500">Sign in with your Theona account to continue.</p>
        {/* Full page navigation, not a fetch — the server needs to set a cookie and redirect
            through Theona's own login page before landing back here. */}
        <a
          href="/api/auth/login"
          className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Sign in with Theona
        </a>
      </div>
    </div>
  );
}
