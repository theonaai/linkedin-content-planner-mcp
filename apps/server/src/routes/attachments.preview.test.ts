import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { CoreServices } from "@linkedin-planner/core";
import { registerAttachmentRoutes, parseRangeHeader } from "./attachments.js";

const ID = randomUUID();
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]);

function buildApp(options: { detected?: { mimeType: string; kind: string } | null; data?: Buffer } = {}) {
  const data = options.data ?? PNG_BYTES;
  const detected = options.detected === undefined ? { mimeType: "image/png", kind: "image" } : options.detected;
  const core = {
    authz: { resolveAttachmentWorkspace: async () => randomUUID(), resolvePostWorkspace: async () => randomUUID() },
    attachments: {
      describeForPreview: async () => ({
        meta: { id: ID, filename: "shot.png", mimeType: "image/png", sizeBytes: data.length },
        detected,
      }),
      readAttachmentRange: async (_id: string, start: number, end: number) => data.subarray(start, end + 1),
      downloadAttachment: async () => ({ meta: { filename: "shot.png", mimeType: "image/png" }, data }),
    },
  } as unknown as CoreServices;

  const app = Fastify();
  registerAttachmentRoutes(app, core, { enabled: false }, "secret");
  return { app, data };
}

describe("parseRangeHeader", () => {
  it("returns null when there is no range to honour", () => {
    expect(parseRangeHeader(undefined, 1000)).toBeNull();
    expect(parseRangeHeader("bytes=-", 1000)).toBeNull();
    // Multipart ranges are legal HTTP that no media element sends; answering with the whole
    // file is valid, so they are treated as no range rather than as an error.
    expect(parseRangeHeader("bytes=0-99,200-299", 1000)).toBeNull();
  });

  it("reads a closed range", () => {
    expect(parseRangeHeader("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
  });

  it("clamps an open-ended range to the last byte", () => {
    expect(parseRangeHeader("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader("bytes=0-99999", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("reads a suffix range as the last N bytes, not as an end offset", () => {
    expect(parseRangeHeader("bytes=-500", 1000)).toEqual({ start: 500, end: 999 });
    // A suffix longer than the file is the whole file, not a negative offset.
    expect(parseRangeHeader("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("rejects a range that cannot be satisfied", () => {
    expect(parseRangeHeader("bytes=1000-", 1000)).toBe("invalid");
    expect(parseRangeHeader("bytes=500-499", 1000)).toBe("invalid");
    expect(parseRangeHeader("bytes=-0", 1000)).toBe("invalid");
  });
});

describe("GET /api/attachments/:id/preview", () => {
  it("serves the sniffed type inline, with the headers that keep it inert", async () => {
    const { app, data } = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/attachments/${ID}/preview` });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-disposition"]).toContain("inline");
    // Without nosniff, a file that lied about its type could still be executed by the browser.
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.rawPayload.equals(data)).toBe(true);
  });

  it("refuses to serve inline anything it could not identify", async () => {
    const { app } = buildApp({ detected: null });
    const res = await app.inject({ method: "GET", url: `/api/attachments/${ID}/preview` });

    expect(res.statusCode).toBe(415);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("answers a range request with 206 and just that window", async () => {
    const { app, data } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/attachments/${ID}/preview`,
      headers: { range: "bytes=10-19" },
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 10-19/${data.length}`);
    expect(res.rawPayload.length).toBe(10);
    expect(res.rawPayload.equals(data.subarray(10, 20))).toBe(true);
  });

  it("answers an unsatisfiable range with 416 rather than the whole file", async () => {
    const { app, data } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/attachments/${ID}/preview`,
      headers: { range: `bytes=${data.length + 10}-` },
    });

    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${data.length}`);
  });
});
