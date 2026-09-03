import { describe, it, expect } from "vitest";
import { detectMediaType, MEDIA_TYPE_SNIFF_BYTES } from "./mediaType.js";

function head(bytes: number[]): Buffer {
  const buf = Buffer.alloc(MEDIA_TYPE_SNIFF_BYTES);
  Buffer.from(bytes).copy(buf);
  return buf;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MP4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];

describe("detectMediaType", () => {
  it.each([
    ["png", PNG, "image/png", "image"],
    ["jpeg", [0xff, 0xd8, 0xff, 0xe0], "image/jpeg", "image"],
    ["gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif", "image"],
    ["pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], "application/pdf", "pdf"],
    ["mp4", MP4, "video/mp4", "video"],
  ])("detects %s", (_name, bytes, mimeType, kind) => {
    expect(detectMediaType(head(bytes))).toEqual({ mimeType, kind });
  });

  it("detects webp only when the WEBP tag follows the RIFF header", () => {
    const riff = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00];
    expect(detectMediaType(head([...riff, 0x57, 0x45, 0x42, 0x50]))).toEqual({
      mimeType: "image/webp",
      kind: "image",
    });
    // RIFF is also a wav/avi container; without the WEBP tag it is not an image.
    expect(detectMediaType(head([...riff, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });

  it("refuses SVG, which is an image but can carry script", () => {
    expect(detectMediaType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it("refuses HTML, however it was labelled on upload", () => {
    expect(detectMediaType(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });

  it("refuses a file whose first bytes match nothing known", () => {
    expect(detectMediaType(head([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("does not read past the end of a short buffer", () => {
    expect(detectMediaType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(detectMediaType(Buffer.alloc(0))).toBeNull();
  });
});
