import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { NotFoundError, type CoreServices } from "@linkedin-planner/core";
import { registerAccessKeyRoutes } from "./accessKeys.js";
import { registerErrorHandler } from "../errorHandler.js";
import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";
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

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const FOREIGN_WORKSPACE = "99999999-9999-4999-8999-999999999999";

async function buildApp() {
  const accessKeys = {
    createAccessKey: vi.fn(),
    listAccessKeys: vi.fn(async () => []),
    revokeAccessKey: vi.fn(),
  };
  const users = {
    assertMembership: vi.fn(async (_userId: string, workspaceId: string) => {
      if (workspaceId !== OWN_WORKSPACE) throw new NotFoundError("Workspace membership", workspaceId);
    }),
    listMemberships: vi.fn(async () => [{ workspaceId: OWN_WORKSPACE }]),
  };
  const app = Fastify();
  await app.register(cookie);
  registerErrorHandler(app);
  registerAccessKeyRoutes(app, { accessKeys, users } as unknown as CoreServices, authEnv);
  const session = await createSessionToken(authEnv.sessionCookieSecret, { userId: USER_ID });
  return { app, accessKeys, cookies: { [SESSION_COOKIE_NAME]: session } };
}

describe("access key routes", () => {
  it("refuses to create a key for a workspace the caller is not a member of", async () => {
    const { app, accessKeys, cookies } = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/access-keys",
      cookies,
      headers: { "x-workspace-id": FOREIGN_WORKSPACE },
      payload: { label: "Apify" },
    });

    expect(res.statusCode).toBe(404);
    expect(accessKeys.createAccessKey).not.toHaveBeenCalled();
  });

  it("creates a key in the caller's own workspace", async () => {
    const { app, accessKeys, cookies } = await buildApp();
    accessKeys.createAccessKey.mockResolvedValue({ id: "k", accessKey: "planner_mcp_x" });

    const res = await app.inject({
      method: "POST",
      url: "/api/access-keys",
      cookies,
      headers: { "x-workspace-id": OWN_WORKSPACE },
      payload: { label: "Apify" },
    });

    expect(res.statusCode).toBe(201);
    expect(accessKeys.createAccessKey).toHaveBeenCalledWith({ userId: USER_ID, workspaceId: OWN_WORKSPACE, label: "Apify" });
  });

  it("answers 404, not 500, for a malformed key id", async () => {
    const { app, accessKeys, cookies } = await buildApp();

    const res = await app.inject({ method: "DELETE", url: "/api/access-keys/not-a-uuid", cookies });

    expect(res.statusCode).toBe(404);
    expect(accessKeys.revokeAccessKey).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: "GET", url: "/api/access-keys" });

    expect(res.statusCode).toBe(401);
  });
});
