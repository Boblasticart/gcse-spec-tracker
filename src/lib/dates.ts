/** Dates as the legacy tracker uses them: plain `YYYY-MM-DD` strings. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(v: unknown): v is string {
  return typeof v === "string" && ISO_DAY.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());
}

/** Today's date in the UK (the students' time zone), e.g. "2026-11-08". */
export function londonToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Legacy `addDays`: calendar days, computed at midday so clock changes never matter. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Legacy `pct`: whole-number percentage, 0 when there is nothing to count. */
export function pct(n: number, total: number): number {
  return total ? Math.round((100 * n) / total) : 0;
}

/** Legacy `fmt`: "12 Nov" for a `YYYY-MM-DD` day, "" when there is none. */
export function shortDay(day: string | undefined): string {
  if (!day || !isIsoDay(day)) return "";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
