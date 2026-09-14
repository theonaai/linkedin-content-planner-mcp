import { describe, it, expect, vi } from "vitest";
import { MCP_ACCESS_KEY_PREFIX, type ActiveAccessKey } from "@linkedin-planner/core";
import { REQUIRED_MCP_SCOPE, validateBearerAccessToken, type AccessKeyLookup } from "./auth.js";
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

const RAW_KEY = `${MCP_ACCESS_KEY_PREFIX}test-key`;

const liveKey: ActiveAccessKey = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  lastUsedAt: null,
};

function lookup(find: AccessKeyLookup["findActiveAccessKey"]) {
  return {
    findActiveAccessKey: vi.fn(find),
    recordAccessKeyUse: vi.fn(async () => undefined),
  };
}

describe("an access key at /mcp", () => {
  it("authenticates as the key's creator in the key's workspace", async () => {
    const accessKeys = lookup(async () => liveKey);

    const result = await validateBearerAccessToken(`Bearer ${RAW_KEY}`, authEnv, accessKeys);

    expect(result).toEqual({
      kind: "ok",
      context: { userId: liveKey.userId, clientId: null, workspaceId: liveKey.workspaceId, scopes: [REQUIRED_MCP_SCOPE] },
    });
    expect(accessKeys.findActiveAccessKey).toHaveBeenCalledWith(RAW_KEY);
    expect(accessKeys.recordAccessKeyUse).toHaveBeenCalledWith(liveKey);
  });

  it("reads the bearer the same way for a lowercase scheme and extra spaces", async () => {
    const accessKeys = lookup(async () => liveKey);

    const result = await validateBearerAccessToken(`bearer   ${RAW_KEY}`, authEnv, accessKeys);

    expect(result.kind).toBe("ok");
  });

  it("refuses an unknown or revoked key", async () => {
    const result = await validateBearerAccessToken(`Bearer ${RAW_KEY}`, authEnv, lookup(async () => null));

    expect(result).toEqual({ kind: "unauthenticated", reason: "Access key is invalid or revoked" });
  });

  it("answers unavailable, not unauthenticated, when the key store fails", async () => {
    const failure = new Error("connection reset");

    const result = await validateBearerAccessToken(
      `Bearer ${RAW_KEY}`,
      authEnv,
      lookup(async () => {
        throw failure;
      }),
    );

    expect(result).toEqual({ kind: "unavailable", reason: "Could not verify the access key", cause: failure });
  });

  it("still authenticates when recording the key's use fails", async () => {
    const accessKeys = {
      findActiveAccessKey: vi.fn(async () => liveKey),
      recordAccessKeyUse: vi.fn(async () => {
        throw new Error("write failed");
      }),
    };

    const result = await validateBearerAccessToken(`Bearer ${RAW_KEY}`, authEnv, accessKeys);

    expect(result.kind).toBe("ok");
  });

  it("never looks up a bearer that is not an access key", async () => {
    const accessKeys = lookup(async () => liveKey);

    const result = await validateBearerAccessToken("Bearer eyJhbGciOiJFUzI1NiJ9.x.y", authEnv, accessKeys);

    expect(result.kind).toBe("unauthenticated");
    expect(accessKeys.findActiveAccessKey).not.toHaveBeenCalled();
  });
});
