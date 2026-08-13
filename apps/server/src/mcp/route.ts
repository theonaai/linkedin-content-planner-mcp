import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CoreServices } from "@linkedin-planner/core";
import type { AuthEnv } from "../env.js";
import { validateBearerAccessToken, REQUIRED_MCP_SCOPE } from "./auth.js";
import { createMcpServer } from "./server.js";
import type { UploadTicketConfig } from "../attachments/uploadTicket.js";

const methodNotAllowed = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed. This is a stateless MCP endpoint — use POST." },
  id: null,
};

function transportError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, error: { code, message }, id: null };
}

function buildWwwAuthenticate(
  auth: AuthEnv,
  options: { kind: "unauthenticated"; errorDescription?: string } | { kind: "insufficient_scope"; requiredScope: string },
): string {
  const prmUrl = `${auth.appPublicBaseUrl}/.well-known/oauth-protected-resource/mcp`;
  const parts = [`Bearer realm="linkedin-planner-mcp"`];
  if (options.kind === "unauthenticated") {
    parts.push(`resource_metadata="${prmUrl}"`);
    parts.push(`scope="${REQUIRED_MCP_SCOPE}"`);
    if (options.errorDescription) parts.push(`error_description="${options.errorDescription.replace(/"/g, '\\"')}"`);
  } else {
    parts.push(`error="insufficient_scope"`);
    parts.push(`scope="${options.requiredScope}"`);
    parts.push(`resource_metadata="${prmUrl}"`);
  }
  return parts.join(", ");
}

/** Resolves which workspace this request may touch. When auth is off, it's always the single
 * implicit workspace (today's behavior, unchanged). When on, a valid bearer token is required,
 * and its `workspace_id` claim is re-validated against live membership — not just trusted from
 * the token — since the user may have left the workspace since the token was minted. */
async function resolveWorkspace(
  request: FastifyRequest,
  reply: FastifyReply,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  defaultWorkspaceId: string,
): Promise<string | null> {
  if (!auth.enabled) return defaultWorkspaceId;

  const authHeader = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
  const resolution = await validateBearerAccessToken(authHeader, auth);

  if (resolution.kind === "unauthenticated") {
    reply
      .header("WWW-Authenticate", buildWwwAuthenticate(auth, { kind: "unauthenticated", errorDescription: resolution.reason }))
      .code(401)
      .send(transportError(-32001, `Unauthorized: ${resolution.reason}. See the WWW-Authenticate header for discovery.`));
    return null;
  }
  if (resolution.kind === "forbidden") {
    reply
      .header("WWW-Authenticate", buildWwwAuthenticate(auth, { kind: "insufficient_scope", requiredScope: resolution.requiredScope }))
      .code(403)
      .send(transportError(-32002, `Forbidden: ${resolution.reason}. Required scope: ${resolution.requiredScope}.`));
    return null;
  }
  if (!resolution.context.workspaceId) {
    reply
      .code(403)
      .send(transportError(-32002, "Forbidden: this token isn't bound to a workspace — re-authorize and pick one at consent."));
    return null;
  }
  try {
    await core.users.assertMembership(resolution.context.userId, resolution.context.workspaceId);
  } catch {
    reply.code(403).send(transportError(-32002, "Forbidden: no longer a member of this token's workspace."));
    return null;
  }
  return resolution.context.workspaceId;
}

async function handleMcpPost(
  request: FastifyRequest,
  reply: FastifyReply,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  defaultWorkspaceId: string,
  uploads: UploadTicketConfig,
) {
  const workspaceId = await resolveWorkspace(request, reply, core, auth, defaultWorkspaceId);
  if (!workspaceId) return; // response already sent by resolveWorkspace

  const server = createMcpServer(core, workspaceId, uploads);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  reply.hijack();
  reply.raw.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
}

export function registerMcpRoutes(
  app: FastifyInstance,
  core: CoreServices,
  auth: AuthEnv | { enabled: false },
  defaultWorkspaceId: string,
  uploads: UploadTicketConfig,
) {
  app.post("/mcp", async (request, reply) => {
    await handleMcpPost(request, reply, core, auth, defaultWorkspaceId, uploads);
  });

  app.get("/mcp", async (_request, reply) => {
    reply.code(405).send(methodNotAllowed);
  });

  app.delete("/mcp", async (_request, reply) => {
    reply.code(405).send(methodNotAllowed);
  });
}
