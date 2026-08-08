import { describe, it, expect } from "vitest";
import { toLinkedInPreview } from "./markdown.js";
import { toBoldUnicode, toItalicUnicode, toBoldItalicUnicode } from "./unicodeAlphabet.js";

describe("toLinkedInPreview", () => {
  it("leaves plain text untouched", () => {
    expect(toLinkedInPreview("plain text, no markup")).toBe("plain text, no markup");
  });

  it("converts **bold** to bold Unicode and drops the markers", () => {
    expect(toLinkedInPreview("**bold**")).toBe(toBoldUnicode("bold"));
  });

  it("converts *italic* and _italic_ to italic Unicode", () => {
    expect(toLinkedInPreview("*italic*")).toBe(toItalicUnicode("italic"));
    expect(toLinkedInPreview("_italic_")).toBe(toItalicUnicode("italic"));
  });

  it("converts ***bold italic*** to the bold-italic Unicode block", () => {
    expect(toLinkedInPreview("***both***")).toBe(toBoldItalicUnicode("both"));
  });

  it("converts a mixed sentence, leaving unmarked text alone", () => {
    const result = toLinkedInPreview("**Launching today.** Here's why it matters.");
    expect(result).toBe(`${toBoldUnicode("Launching today.")} Here's why it matters.`);
  });

  it("converts '- ' bullet lines to a bullet character and preserves line breaks", () => {
    const result = toLinkedInPreview("Intro line\n- first point\n- second point");
    expect(result).toBe("Intro line\n• first point\n• second point");
  });

  it("does not treat mid-line hyphens as bullets", () => {
    expect(toLinkedInPreview("state-of-the-art results")).toBe("state-of-the-art results");
  });
});
