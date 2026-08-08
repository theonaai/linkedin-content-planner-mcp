import { describe, it, expect } from "vitest";
import { remapAnchor } from "./anchorRemap.js";

describe("remapAnchor", () => {
  it("finds unchanged text at its new position after an unrelated edit earlier in the text", () => {
    const oldText = "Launching today. Here's why it matters.";
    const newText = "Big news: launching today soon. Here's why it matters a lot.";
    const offset = oldText.indexOf("Here's why it matters");
    const remapped = remapAnchor(oldText, newText, offset, "Here's why it matters".length);
    expect(remapped).toBe(newText.indexOf("Here's why it matters"));
  });

  it("returns null when the anchored text itself was edited", () => {
    const oldText = "Launching today. Here's why it matters.";
    const newText = "Launching today. Here's why it matters a lot more now.";
    const offset = oldText.indexOf("Here's why it matters.");
    const remapped = remapAnchor(oldText, newText, offset, "Here's why it matters.".length);
    expect(remapped).toBeNull();
  });

  it("returns null when the anchored text was removed entirely", () => {
    const oldText = "Keep this. Remove this part. Keep this too.";
    const newText = "Keep this. Keep this too.";
    const offset = oldText.indexOf("Remove this part.");
    const remapped = remapAnchor(oldText, newText, offset, "Remove this part.".length);
    expect(remapped).toBeNull();
  });

  it("picks the occurrence closest to the original offset when the snippet repeats", () => {
    const oldText = "aaa middle bbb middle ccc";
    const offset = oldText.indexOf("middle", 5); // the second occurrence
    // newText starts with oldText verbatim, so both original occurrences keep their exact
    // offsets, plus a third far-away occurrence is appended at the end.
    const newText = `${oldText} and yet another middle way out here`;
    const remapped = remapAnchor(oldText, newText, offset, "middle".length);
    expect(remapped).toBe(offset);
  });

  it("returns null for an out-of-range or empty anchor", () => {
    expect(remapAnchor("short", "short and longer", 0, 0)).toBeNull();
    expect(remapAnchor("short", "short and longer", 100, 5)).toBeNull();
  });

  it("is a no-op (same offset) when nothing changed", () => {
    const text = "Nothing changed here at all.";
    const offset = text.indexOf("changed");
    expect(remapAnchor(text, text, offset, "changed".length)).toBe(offset);
  });
});
