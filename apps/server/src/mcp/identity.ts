/**
 * Who this MCP server says it is. One definition, three consumers: the `serverInfo` block of the
 * MCP `initialize` response (mcp/server.ts), the registry server card at `/.well-known/mcp.json`,
 * and any registry listing built from that card (routes/well-known.ts).
 *
 * Kept in its own module so the card can be built without importing the whole tool surface, and
 * so the name a client sees over MCP can never silently drift from the name a registry indexes.
 */

/** `serverInfo.name` in the MCP `initialize` response — the on-the-wire implementation name. */
export const MCP_SERVER_NAME = "linkedin-content-planner";

/**
 * Registry identity for `/.well-known/mcp.json`. The MCP registry's server.json schema requires
 * reverse-DNS with exactly one slash: namespace before, server name after. `app.theona` is the
 * reverse DNS of `theona.app`, which is what a registry would ask us to prove ownership of (a
 * DNS TXT record) when publishing.
 */
export const MCP_REGISTRY_NAME = `app.theona/${MCP_SERVER_NAME}`;

/** Shared by `serverInfo.version` and the server card, so a registry never lists a stale version. */
export const MCP_SERVER_VERSION = "0.1.0";

/** Human-facing display name, matching the web UI's title. */
export const MCP_SERVER_TITLE = "LinkedIn Content Planner";

/**
 * Written for the model deciding whether to connect, not for a landing page: it names the verbs
 * the tool surface actually offers and the one constraint that changes how an agent plans
 * (a human gate before anything is published). The registry schema caps this at 100 characters.
 */
export const MCP_SERVER_DESCRIPTION =
  "Draft, revise and review LinkedIn posts; a human approves each one before it goes live.";

/** Public source, for the card's `repository` block. */
export const REPOSITORY_URL = "https://github.com/theonaai/linkedin-content-planner-mcp";

/** GitHub's own repo id, stable across renames — see the server.json schema's `repository.id`. */
export const REPOSITORY_ID = "1331128401";
