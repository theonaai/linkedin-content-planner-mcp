import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { CoreServices } from "@linkedin-planner/core";
import { registerAttachmentRoutes } from "./attachments.js";
import { mintUploadTicket, UPLOAD_TICKET_TTL_MS } from "../attachments/uploadTicket.js";

const SECRET = "route-test-secret";
const POST_ID = randomUUID();
const WORKSPACE_ID = randomUUID();

interface AttachCall {
  postId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

function buildApp(options: { postWorkspaceId?: string } = {}) {
  const calls: AttachCall[] = [];
  const core = {
    authz: {
      resolvePostWorkspace: async () => options.postWorkspaceId ?? WORKSPACE_ID,
    },
    attachments: {
      attachFile: async (params: AttachCall) => {
        calls.push(params);
        return { id: randomUUID(), postId: params.postId, sizeBytes: params.data.length };
      },
    },
  } as unknown as CoreServices;

  const app = Fastify();
  registerAttachmentRoutes(app, core, { enabled: false }, SECRET);
  return { app, calls };
}

function ticket(overrides: Partial<Parameters<typeof mintUploadTicket>[0]> = {}) {
  return mintUploadTicket(
    {
      postId: POST_ID,
      workspaceId: WORKSPACE_ID,
      filename: "carousel.pdf",
      mimeType: "application/pdf",
      exp: Date.now() + UPLOAD_TICKET_TTL_MS,
      ...overrides,
    },
    SECRET,
  );
}

describe("PUT /api/attachments/upload", () => {
  let app: FastifyInstance;
  let calls: AttachCall[];

  beforeEach(() => {
    ({ app, calls } = buildApp());
  });

  it("stores raw bytes under the filename the ticket was minted with", async () => {
    const payload = Buffer.from("%PDF-1.7 not really a pdf");
    const response = await app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${ticket()}`,
      payload,
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.statusCode).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].postId).toBe(POST_ID);
    expect(calls[0].filename).toBe("carousel.pdf");
    expect(calls[0].mimeType).toBe("application/pdf");
    // The bytes must survive the transport untouched — this is the whole point of the route.
    expect(calls[0].data.equals(payload)).toBe(true);
  });

  it("accepts binary that is not valid UTF-8", async () => {
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0xfe]);
    const response = await app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${ticket({ filename: "pixel.png", mimeType: "image/png" })}`,
      payload,
      headers: { "content-type": "image/png" },
    });

    expect(response.statusCode).toBe(201);
    expect(calls[0].data.equals(payload)).toBe(true);
  });

  it("rejects an expired ticket without storing anything", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${ticket({ exp: Date.now() - 1 })}`,
      payload: Buffer.from("x"),
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("expired");
    expect(calls).toHaveLength(0);
  });

  it("rejects a ticket signed with the wrong secret", async () => {
    const forged = mintUploadTicket(
      { postId: POST_ID, workspaceId: WORKSPACE_ID, filename: "x.pdf", mimeType: "application/pdf", exp: Date.now() + 60_000 },
      "not-the-secret",
    );
    const response = await app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${forged}`,
      payload: Buffer.from("x"),
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("rejects a ticket whose post has moved to another workspace since it was minted", async () => {
    const moved = buildApp({ postWorkspaceId: randomUUID() });
    const response = await moved.app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${ticket()}`,
      payload: Buffer.from("x"),
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.statusCode).toBe(403);
    expect(moved.calls).toHaveLength(0);
  });

  it("rejects an empty body rather than storing a zero-byte attachment", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/attachments/upload?ticket=${ticket()}`,
      payload: Buffer.alloc(0),
      headers: { "content-type": "application/octet-stream" },
    });

    expect(response.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
