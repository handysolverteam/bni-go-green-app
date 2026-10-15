/**
 * Week helpers for the Traffic Lights screen. Reports are imported ONE WEEK at a time; each week is placed in a
 * window by its Wednesday meeting date.
 */
export type WeekRange = { from: string; to: string };

/** One report is one week: BNI's From/To for a weekly run is at most this many days (inclusive). */
export const MAX_WEEK_DAYS = 7;
/** BNI measures performance over the last 6 months by date (26 or 27 meetings). */
export const WINDOW_MONTHS = 6;

const DAY_MS = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, '0');

function parseDay(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

export const isoOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Days from `from` to `to`, both included (a one-day report = 1). 0 for an invalid or reversed range. */
export function spanDays(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === null || b === null || b < a) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** The Wednesday inside the range when there is exactly one; otherwise the range's last day. */
export function meetingDateOf(from: string, to: string): string {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === null || b === null || b < a) return to;
  const wednesdays: number[] = [];
  for (let t = a; t <= b; t += DAY_MS) if (new Date(t).getUTCDay() === 3) wednesdays.push(t);
  return wednesdays.length === 1 ? isoOf(wednesdays[0]) : to;
}

/** Why a report cannot be imported as ONE week; null when it can. */
export function validateWeekRange(from: string | null, to: string | null): string | null {
  if (!from || !to) return 'The report has no readable From:/To: date range.';
  if (spanDays(from, to) === 0) return `The report's date range is not valid (${from} to ${to}).`;
  const days = spanDays(from, to);
  if (days > MAX_WEEK_DAYS) {
    return `This report covers ${days} days (${from} to ${to}). Traffic Lights stores one week per import — export the report for a single week.`;
  }
  return null;
}

export const sameRange = (a: WeekRange, b: WeekRange): boolean => a.from === b.from && a.to === b.to;

export const rangesOverlap = (a: WeekRange, b: WeekRange): boolean => a.from <= b.to && b.from <= a.to;

/** An already-imported week that overlaps `next` without being the same week (importing both would double count). */
export function findConflict(existing: WeekRange[], next: WeekRange): WeekRange | null {
  return existing.find((e) => !sameRange(e, next) && rangesOverlap(e, next)) ?? null;
}

export type PeriodWindow = { from: string; to: string };

/**
 * The `months`-month window ending on `anchor`: it starts the day AFTER the anchor's day-of-month, `months` months
 * earlier (clamped to that month's length) — BNI's "last 6 months" (26 or 27 Wednesdays).
 */
export function rollingWindow(anchor: string | null | undefined, months: number = WINDOW_MONTHS): PeriodWindow | null {
  const ms = parseDay(anchor);
  if (ms === null || months < 1) return null;
  const a = new Date(ms);
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const prior = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(a.getUTCDate(), lastDay));
  return { from: isoOf(prior + DAY_MS), to: isoOf(ms) };
}

/** Newest valid date; null when there is none. */
export function latestDate(dates: Iterable<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const d of dates) {
    const k = parseDay(d) === null ? null : String(d).slice(0, 10);
    if (k && (best === null || k > best)) best = k;
  }
  return best;
}

export const inRange = (date: string | null | undefined, w: PeriodWindow): boolean =>
  !!date && date.slice(0, 10) >= w.from && date.slice(0, 10) <= w.to;

const dayLabel = (iso: string, withYear: boolean): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

/** "31 Mar – 14 Oct 2026" (year shown on both ends only when the range crosses a year). */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return dayLabel(from, true);
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${dayLabel(from, false)} – ${dayLabel(to, true)}`
    : `${dayLabel(from, true)} – ${dayLabel(to, true)}`;
}
