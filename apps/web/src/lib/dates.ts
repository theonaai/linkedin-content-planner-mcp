/** Formats an ISO "YYYY-MM-DD" date for display without UTC-shift bugs
 * (new Date("2026-09-01") parses as UTC midnight, which can display as the
 * previous day in negative-UTC-offset timezones). */
export function formatDateDisplay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
