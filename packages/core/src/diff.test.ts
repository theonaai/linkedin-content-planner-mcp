import { describe, it, expect } from "vitest";
import { diffContent } from "./diff.js";

describe("diffContent", () => {
  it("reports no changes for identical content", () => {
    const ops = diffContent("hello\nworld\n", "hello\nworld\n");
    expect(ops.every((op) => op.type === "context")).toBe(true);
  });

  it("reports an added line", () => {
    const ops = diffContent("line one\n", "line one\nline two\n");
    expect(ops.some((op) => op.type === "add" && op.value.includes("line two"))).toBe(true);
  });

  it("reports a removed line", () => {
    const ops = diffContent("line one\nline two\n", "line one\n");
    expect(ops.some((op) => op.type === "remove" && op.value.includes("line two"))).toBe(true);
  });
});
