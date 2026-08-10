/** RFC 9728 Protected Resource Metadata for /mcp — publicly reachable so MCP hosts can
 * discover the AS after a 401. Unauthenticated by design; it's the bootstrap document. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { REQUIRED_MCP_SCOPE } from "../mcp/auth.js";
import { mcpResourceIdentifier } from "../services/oauth/resource.js";
import type { AuthEnv } from "../env.js";

const PRM_PATH = "/.well-known/oauth-protected-resource/mcp";

export function registerWellKnownRoutes(app: FastifyInstance, auth: AuthEnv): void {
  app.get(PRM_PATH, (_request: FastifyRequest, reply: FastifyReply) => {
    reply
      .header("Content-Type", "application/json")
      .header("Cache-Control", "public, max-age=300")
      .status(200)
      .send({
        resource: mcpResourceIdentifier(auth),
        authorization_servers: [auth.appPublicBaseUrl],
        scopes_supported: [REQUIRED_MCP_SCOPE],
        bearer_methods_supported: ["header"],
      });
  });
}
