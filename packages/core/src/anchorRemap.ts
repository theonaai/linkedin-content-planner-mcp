/**
 * Relocates a text anchor from an older version's content into newer content, the way
 * git/GitHub keep a review comment attached to a line that hasn't changed even as the rest
 * of the file moves around it. Returns the new offset if the exact anchored text still
 * appears somewhere in the new text, or null if it doesn't (the comment is "stale" —
 * the text it referred to was edited or removed).
 */
export function remapAnchor(oldText: string, newText: string, offset: number, length: number): number | null {
  if (length <= 0 || offset < 0 || offset + length > oldText.length) return null;
  const snippet = oldText.slice(offset, offset + length);
  if (!snippet) return null;

  const occurrences: number[] = [];
  let idx = newText.indexOf(snippet);
  while (idx !== -1) {
    occurrences.push(idx);
    idx = newText.indexOf(snippet, idx + 1);
  }
  if (occurrences.length === 0) return null;
  if (occurrences.length === 1) return occurrences[0];

  // Multiple matches for the same snippet: edits are usually localized, so the occurrence
  // closest to the original offset is the most likely to be "the same" one.
  return occurrences.reduce((best, cur) => (Math.abs(cur - offset) < Math.abs(best - offset) ? cur : best));
}
