import { describe, it, expect } from "vitest";
import { toBoldUnicode, toItalicUnicode, toBoldItalicUnicode } from "./unicodeAlphabet.js";

describe("toBoldUnicode", () => {
  it("maps capital, lowercase, and digit ranges", () => {
    expect(toBoldUnicode("A")).toBe(String.fromCodePoint(0x1d400));
    expect(toBoldUnicode("Z")).toBe(String.fromCodePoint(0x1d400 + 25));
    expect(toBoldUnicode("a")).toBe(String.fromCodePoint(0x1d41a));
    expect(toBoldUnicode("z")).toBe(String.fromCodePoint(0x1d41a + 25));
    expect(toBoldUnicode("0")).toBe(String.fromCodePoint(0x1d7ce));
    expect(toBoldUnicode("9")).toBe(String.fromCodePoint(0x1d7ce + 9));
  });

  it("leaves punctuation and spaces untouched", () => {
    expect(toBoldUnicode("Hi, world!")).toBe(
      `${toBoldUnicode("Hi")}, ${toBoldUnicode("world")}!`,
    );
  });
});

describe("toItalicUnicode", () => {
  it("maps capitals normally", () => {
    expect(toItalicUnicode("A")).toBe(String.fromCodePoint(0x1d434));
    expect(toItalicUnicode("H")).toBe(String.fromCodePoint(0x1d434 + 7));
  });

  it("uses the Planck-constant lookalike for lowercase h (the one gap in this Unicode block)", () => {
    expect(toItalicUnicode("h")).toBe("ℎ");
  });

  it("maps other lowercase letters normally", () => {
    expect(toItalicUnicode("a")).toBe(String.fromCodePoint(0x1d44e));
    expect(toItalicUnicode("g")).toBe(String.fromCodePoint(0x1d44e + 6));
    expect(toItalicUnicode("i")).toBe(String.fromCodePoint(0x1d44e + 8));
  });

  it("leaves digits unchanged (no italic digit block exists in Unicode)", () => {
    expect(toItalicUnicode("2026")).toBe("2026");
  });
});

describe("toBoldItalicUnicode", () => {
  it("maps capitals and lowercase with no gaps", () => {
    expect(toBoldItalicUnicode("A")).toBe(String.fromCodePoint(0x1d468));
    expect(toBoldItalicUnicode("a")).toBe(String.fromCodePoint(0x1d482));
    expect(toBoldItalicUnicode("h")).toBe(String.fromCodePoint(0x1d482 + 7));
  });
});
