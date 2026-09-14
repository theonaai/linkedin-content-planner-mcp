import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { MCP_ACCESS_KEY_PREFIX, type CoreServices } from "@linkedin-planner/core";
import { registerMcpRoutes } from "./route.js";
import type { AuthEnv } from "../env.js";

const authEnv: AuthEnv = {
  enabled: true,
  theonaIssuer: "https://theona.example.test",
  appPublicBaseUrl: "https://linkedin-mcp.example.test",
  sessionCookieSecret: "session-secret",
  theonaClientId: "client-id",
  mcpOauthJwks: "{}",
  mcpOauthCookieKeys: ["cookie-key"],
};

function buildApp(findActiveAccessKey: () => Promise<null>) {
  const core = { accessKeys: { findActiveAccessKey, recordAccessKeyUse: async () => undefined } };
  const app = Fastify();
  registerMcpRoutes(app, core as unknown as CoreServices, authEnv, "unused-default-workspace", {
    secret: "upload-secret",
    publicBaseUrl: authEnv.appPublicBaseUrl,
  });
  return app;
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
const headers = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
  authorization: `Bearer ${MCP_ACCESS_KEY_PREFIX}test-key`,
};

describe("POST /mcp with an access key", () => {
  it("answers 503, not 401, when the key store fails", async () => {
    // A 401 would tell the holder of a working key that it is invalid, and they replace a
    // credential that was fine over one slow minute in the database.
    const app = buildApp(async () => {
      throw new Error("connection reset");
    });

    const res = await app.inject({ method: "POST", url: "/mcp", headers, payload: initialize });

    expect(res.statusCode).toBe(503);
    expect(res.headers["www-authenticate"]).toBeUndefined();
    expect(res.json().error.code).toBe(-32003);
  });

  it("challenges an unknown key with a 401", async () => {
    const app = buildApp(async () => null);

    const res = await app.inject({ method: "POST", url: "/mcp", headers, payload: initialize });

    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain('realm="linkedin-planner-mcp"');
  });
});
