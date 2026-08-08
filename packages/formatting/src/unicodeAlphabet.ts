/**
 * Maps ASCII letters/digits to Unicode "Mathematical Alphanumeric Symbols" lookalikes.
 * LinkedIn has no real bold/italic rendering — these code points are how every LinkedIn
 * text formatter fakes it, since the glyphs themselves look bold/italic in any font.
 *
 * The plain-italic block has one gap: lowercase italic "h" was never assigned (it collides
 * with the pre-existing Planck-constant symbol), so U+210E is used there instead.
 */

const UPPER_A = "A".charCodeAt(0);
const LOWER_A = "a".charCodeAt(0);
const DIGIT_0 = "0".charCodeAt(0);
const ITALIC_SMALL_H = "ℎ";

function mapLetterOrDigit(
  ch: string,
  bases: { upper: number; lower: number; digit?: number },
): string {
  const code = ch.codePointAt(0)!;
  if (code >= UPPER_A && code <= UPPER_A + 25) {
    return String.fromCodePoint(bases.upper + (code - UPPER_A));
  }
  if (code >= LOWER_A && code <= LOWER_A + 25) {
    return String.fromCodePoint(bases.lower + (code - LOWER_A));
  }
  if (bases.digit !== undefined && code >= DIGIT_0 && code <= DIGIT_0 + 9) {
    return String.fromCodePoint(bases.digit + (code - DIGIT_0));
  }
  return ch;
}

function mapText(text: string, bases: { upper: number; lower: number; digit?: number }): string {
  return Array.from(text)
    .map((ch) => mapLetterOrDigit(ch, bases))
    .join("");
}

export function toBoldUnicode(text: string): string {
  return mapText(text, { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce });
}

export function toItalicUnicode(text: string): string {
  return Array.from(text)
    .map((ch) => (ch === "h" ? ITALIC_SMALL_H : mapLetterOrDigit(ch, { upper: 0x1d434, lower: 0x1d44e })))
    .join("");
}

export function toBoldItalicUnicode(text: string): string {
  return mapText(text, { upper: 0x1d468, lower: 0x1d482 });
}
