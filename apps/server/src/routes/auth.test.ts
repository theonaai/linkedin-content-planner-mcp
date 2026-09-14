import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { CoreServices } from "@linkedin-planner/core";
import { registerAuthRoutes } from "./auth.js";
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

async function flowReturnTo(returnTo: string) {
  const app = Fastify();
  await app.register(cookie);
  registerAuthRoutes(app, {} as CoreServices, authEnv);

  const res = await app.inject({ method: "GET", url: `/api/auth/login?return_to=${encodeURIComponent(returnTo)}` });
  expect(res.statusCode).toBe(302);
  const flow = res.cookies.find((c) => c.name === "theona_oauth_flow");
  return JSON.parse(flow!.value).returnTo as string | undefined;
}

describe("login return_to", () => {
  it("keeps a page on the planner's own origin, with its query", async () => {
    expect(await flowReturnTo("https://linkedin-mcp.example.test/connect?label=Apify")).toBe(
      "https://linkedin-mcp.example.test/connect?label=Apify",
    );
  });

  it("drops a host that only starts with the planner's origin", async () => {
    expect(await flowReturnTo("https://linkedin-mcp.example.test.evil.test/connect")).toBeUndefined();
  });

  it("drops another origin and a non-URL", async () => {
    expect(await flowReturnTo("https://evil.test/")).toBeUndefined();
    expect(await flowReturnTo("//evil.test")).toBeUndefined();
  });
});
