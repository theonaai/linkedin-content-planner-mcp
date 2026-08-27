import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerWellKnownRoutes, PRM_PATH, SERVER_CARD_PATH } from "./well-known.js";
import { REQUIRED_MCP_SCOPE } from "../mcp/auth.js";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "../mcp/identity.js";
import type { AuthEnv, Env } from "../env.js";

const BASE_URL = "https://linkedin-mcp.example.test";

const authEnv: AuthEnv = {
  enabled: true,
  theonaIssuer: "https://theona.example.test",
  appPublicBaseUrl: BASE_URL,
  sessionCookieSecret: "session-secret",
  theonaClientId: "client-id",
  mcpOauthJwks: "{}",
  mcpOauthCookieKeys: ["cookie-key"],
};

function buildEnv(auth: Env["auth"]): Env {
  return {
    port: 3210,
    databaseUrl: "postgres://unused",
    publicBaseUrl: BASE_URL,
    attachmentUploadSecret: "upload-secret",
    storage: { driver: "local", attachmentsDir: "./data/attachments" },
    auth,
  };
}

function buildApp(auth: Env["auth"]) {
  const app = Fastify();
  registerWellKnownRoutes(app, buildEnv(auth));
  return app;
}

describe(`GET ${SERVER_CARD_PATH}`, () => {
  it("serves the server card without any credential", async () => {
    const app = buildApp(authEnv);

    const res = await app.inject({ method: "GET", url: SERVER_CARD_PATH });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("points at the streamable-http endpoint the MCP route actually serves", async () => {
    const app = buildApp(authEnv);

    const card = (await app.inject({ method: "GET", url: SERVER_CARD_PATH })).json();

    expect(card.remotes).toEqual([{ type: "streamable-http", url: `${BASE_URL}/mcp` }]);
  });

  it("carries the registry-required fields, with a description inside the schema's 100-char cap", async () => {
    const app = buildApp(authEnv);

    const card = (await app.inject({ method: "GET", url: SERVER_CARD_PATH })).json();

    // Reverse-DNS with exactly one slash — the server.json `name` pattern.
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.name.endsWith(`/${MCP_SERVER_NAME}`)).toBe(true);
    expect(card.version).toBe(MCP_SERVER_VERSION);
    expect(card.description.length).toBeGreaterThan(0);
    expect(card.description.length).toBeLessThanOrEqual(100);
  });

  it("advertises OAuth and where to look it up when auth is on", async () => {
    const app = buildApp(authEnv);

    const card = (await app.inject({ method: "GET", url: SERVER_CARD_PATH })).json();
    const authMeta = card._meta["io.modelcontextprotocol.registry/publisher-provided"].authorization;

    expect(authMeta.type).toBe("oauth2");
    expect(authMeta.scopes_supported).toEqual([REQUIRED_MCP_SCOPE]);
    // The card must not become a second, drifting source of truth for the PRM location: it has
    // to name the path this same module serves.
    expect(authMeta.protected_resource_metadata).toBe(`${BASE_URL}${PRM_PATH}`);
  });

  it("advertises no auth — and no PRM — in the self-hosted, AUTH_ENABLED-unset default", async () => {
    const app = buildApp({ enabled: false });

    const cardRes = await app.inject({ method: "GET", url: SERVER_CARD_PATH });
    const prmRes = await app.inject({ method: "GET", url: PRM_PATH });

    expect(cardRes.statusCode).toBe(200);
    expect(cardRes.json()._meta["io.modelcontextprotocol.registry/publisher-provided"].authorization).toEqual({
      type: "none",
    });
    expect(prmRes.statusCode).toBe(404);
  });
});

describe(`GET ${PRM_PATH}`, () => {
  it("names the same resource identifier the token check validates `aud` against", async () => {
    const app = buildApp(authEnv);

    const res = await app.inject({ method: "GET", url: PRM_PATH });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resource: `${BASE_URL}/mcp`,
      authorization_servers: [BASE_URL],
      scopes_supported: [REQUIRED_MCP_SCOPE],
      bearer_methods_supported: ["header"],
    });
  });
});
