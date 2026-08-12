import { ProductPreview } from "../components/ProductPreview.js";
import { GitHubIcon } from "../components/icons.js";

export function LoginScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-4 py-12">
      <div className="flex w-full max-w-4xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
        <div className="order-2 lg:order-1">
          <ProductPreview />
        </div>

        <div className="order-1 w-full max-w-sm shrink-0 rounded-2xl border border-border bg-surface-1 p-8 text-center shadow-card lg:order-2">
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

      <a
        href="https://github.com/theonaai/linkedin-content-planner-mcp"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-primary"
      >
        <GitHubIcon className="h-4 w-4" />
        Open source on GitHub
      </a>
    </div>
  );
}
