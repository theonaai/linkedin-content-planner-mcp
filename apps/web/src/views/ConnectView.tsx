import { CodeBlock } from "../components/CodeBlock.js";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted";
const cardClass = "max-w-[900px] rounded-2xl border border-border bg-surface-1 p-7 shadow-card";
const stepClass = "text-sm text-text-secondary";

// Computed from the page's own origin rather than hardcoded, so this stays correct in every
// environment (local dev, staging, production) without needing a config value from the server.
const MCP_URL = `${window.location.origin}/mcp`;

function ClientCard({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: { text: string; code?: string }[];
}) {
  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
      <p className="mt-1.5 text-sm text-text-secondary">{description}</p>
      <div className="mt-5 flex flex-col gap-4">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className={stepClass}>
              <span className="mr-1.5 font-medium text-text-primary">{i + 1}.</span>
              {step.text}
            </p>
            {step.code && <CodeBlock code={step.code} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConnectView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[640px] flex-col gap-2">
        <p className={labelClass}>Integrations</p>
        <h1 className="text-[34px] font-light leading-[1.1] tracking-tight text-text-primary">Connect an agent</h1>
        <p className="text-[15px] text-text-secondary">
          Any MCP-compatible agent can draft, format, and move posts through review by calling tools directly.
          Connect one below — it authorizes with your Theona account, so it only ever sees the workspaces you
          already have access to.
        </p>
      </div>

      <div className={cardClass}>
        <p className={labelClass}>MCP endpoint</p>
        <div className="mt-2.5">
          <CodeBlock code={MCP_URL} />
        </div>
      </div>

      <ClientCard
        title="Claude Code"
        description="Anthropic's terminal-based coding agent."
        steps={[
          { text: "Add the server:", code: `claude mcp add --transport http linkedin-planner ${MCP_URL}` },
          { text: "Inside Claude Code, run /mcp and follow the link to authorize with your Theona account." },
        ]}
      />

      <ClientCard
        title="Codex CLI"
        description="OpenAI's terminal-based coding agent."
        steps={[
          { text: "Add the server:", code: `codex mcp add linkedin-planner --url ${MCP_URL}` },
          { text: "Authorize it:", code: "codex mcp login linkedin-planner" },
        ]}
      />

      <ClientCard
        title="Claude Desktop / claude.ai"
        description="Add it as a custom connector."
        steps={[
          { text: "Settings → Connectors → Add custom connector." },
          { text: "Paste the endpoint below and connect, then approve access with your Theona account:", code: MCP_URL },
        ]}
      />

      <ClientCard
        title="Other MCP clients"
        description="Any client speaking MCP's Streamable HTTP transport with OAuth 2.1 (PKCE + dynamic client registration) can connect directly — point it at the endpoint above and it discovers the authorization server automatically."
        steps={[]}
      />
    </div>
  );
}
