import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CoreServices } from "@linkedin-planner/core";
import { createMcpServer } from "./server.js";

const methodNotAllowed = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed. This is a stateless MCP endpoint — use POST." },
  id: null,
};

async function handleMcpPost(request: FastifyRequest, reply: FastifyReply, core: CoreServices, workspaceId: string) {
  const server = createMcpServer(core, workspaceId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  reply.hijack();
  reply.raw.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
}

export function registerMcpRoutes(app: FastifyInstance, core: CoreServices, workspaceId: string) {
  app.post("/mcp", async (request, reply) => {
    await handleMcpPost(request, reply, core, workspaceId);
  });

  app.get("/mcp", async (_request, reply) => {
    reply.code(405).send(methodNotAllowed);
  });

  app.delete("/mcp", async (_request, reply) => {
    reply.code(405).send(methodNotAllowed);
  });
}
