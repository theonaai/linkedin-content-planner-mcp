import { toBoldItalicUnicode, toBoldUnicode, toItalicUnicode } from "./unicodeAlphabet.js";

/**
 * Converts a line starting with "- " (LinkedIn's supported bullet syntax in this app)
 * into a real bullet character, since LinkedIn renders neither markdown lists nor "-".
 */
function convertBullets(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^(\s*)-\s+/, "$1• "))
    .join("\n");
}

/**
 * Converts the app's markdown subset (double-asterisk bold, single-asterisk or underscore
 * italic, triple-asterisk bold-italic, "- " bullets, literal line breaks) into the Unicode
 * text LinkedIn actually renders. Order matters: longer delimiter runs must be consumed
 * before shorter ones, since by the time we reach the single-asterisk pass no double- or
 * triple-asterisk runs remain to conflict with it.
 */
export function toLinkedInPreview(markdown: string): string {
  let result = convertBullets(markdown);
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, (_m, inner: string) => toBoldItalicUnicode(inner));
  result = result.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => toBoldUnicode(inner));
  result = result.replace(/\*([^*\n]+)\*/g, (_m, inner: string) => toItalicUnicode(inner));
  result = result.replace(/_([^_\n]+)_/g, (_m, inner: string) => toItalicUnicode(inner));
  return result;
}
