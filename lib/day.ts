/**
 * Calendar-day helpers pinned to America/Denver.
 *
 * Momentum is a Utah field business: a "day" is the crew's day, never UTC's.
 * `new Date().toISOString().slice(0,10)` silently rolls over at 6pm MT (5pm in
 * winter), so between 6pm and midnight every such call named TOMORROW. That put
 * the wrong dates in front of customers — Norma's offered days shifted forward,
 * and her Sunday skip tested a weekday that did not match the date string it
 * was filtering. Every day-level decision goes through here.
 */

export const TZ = "America/Denver";

/** Today in Denver as YYYY-MM-DD. */
export function todayDenver(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add whole days to a YYYY-MM-DD string without crossing a timezone. */
export function addDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day string. */
export function dayOfWeek(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Monday", "Tuesday", … for a YYYY-MM-DD day string. */
export function weekdayName(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}
