import { buildTrafficRows, sortTrafficRows, type TrafficRow } from './calc';
import type { ImportedWeek, PalmsWeekRecord, SponsorWeekRecord } from './types';
import { inRange, latestDate, rangeLabel, rollingWindow, type PeriodWindow } from './weeks';

export const LAST_6_MONTHS = 'last6m';
export const ALL_WEEKS = 'all';
export const CUSTOM_RANGE = 'custom';
const WEEK_PREFIX = 'week:';

export type WindowOption = { value: string; label: string };

export type TrafficView = {
  /** The window choice actually used (an unknown choice falls back to the last 6 months). */
  choice: string;
  options: WindowOption[];
  from: string;
  to: string;
  label: string;
  /** Imported weeks inside the window. */
  meetings: number;
  rows: TrafficRow[];
  weeks: ImportedWeek[];
  /** Weeks of the window whose Sponsor Report was not imported (sponsors are undercounted for them). */
  sponsorWeeksMissing: number;
  /** Nothing imported yet, or nothing inside the chosen window. */
  empty: boolean;
};

const weekKey = (from: string, to: string): string => `${from}|${to}`;

/** Every imported week (PALMS and/or Sponsor Report), oldest first. */
export function listWeeks(palms: PalmsWeekRecord[], sponsors: SponsorWeekRecord[]): ImportedWeek[] {
  const map = new Map<string, ImportedWeek>();
  const entry = (from: string, to: string, meeting: string): ImportedWeek => {
    const k = weekKey(from, to);
    let w = map.get(k);
    if (!w) {
      w = { weekFrom: from, weekTo: to, meetingDate: meeting, hasPalms: false, members: 0, hasSponsorReport: false, sponsored: 0 };
      map.set(k, w);
    }
    return w;
  };
  for (const r of palms) {
    const w = entry(r.weekFrom, r.weekTo, r.meetingDate);
    w.hasPalms = true;
    w.members += 1;
  }
  for (const r of sponsors) {
    const w = entry(r.weekFrom, r.weekTo, r.meetingDate);
    w.hasSponsorReport = true;
    if (r.sponsor && r.sponsored) w.sponsored += 1;
  }
  return [...map.values()].sort((a, b) => (a.meetingDate < b.meetingDate ? -1 : a.meetingDate > b.meetingDate ? 1 : a.weekFrom < b.weekFrom ? -1 : 1));
}

function windowOf(choice: string, weeks: ImportedWeek[], custom?: PeriodWindow): { choice: string; window: PeriodWindow | null; pick: (w: ImportedWeek) => boolean } {
  const palmsWeeks = weeks.filter((w) => w.hasPalms);
  if (choice.startsWith(WEEK_PREFIX)) {
    const meeting = choice.slice(WEEK_PREFIX.length);
    const w = palmsWeeks.find((x) => x.meetingDate === meeting);
    if (w) return { choice, window: { from: w.weekFrom, to: w.weekTo }, pick: (x) => x.meetingDate === meeting };
  }
  if (choice === ALL_WEEKS && palmsWeeks.length > 0) {
    const window = { from: palmsWeeks.reduce((m, w) => (w.weekFrom < m ? w.weekFrom : m), palmsWeeks[0].weekFrom), to: palmsWeeks.reduce((m, w) => (w.weekTo > m ? w.weekTo : m), palmsWeeks[0].weekTo) };
    return { choice, window, pick: () => true };
  }
  if (choice === CUSTOM_RANGE && custom && custom.from && custom.to && custom.from <= custom.to) {
    return { choice, window: custom, pick: (w) => inRange(w.meetingDate, custom) };
  }
  const anchor = latestDate(palmsWeeks.map((w) => w.meetingDate));
  const window = rollingWindow(anchor);
  return { choice: LAST_6_MONTHS, window, pick: (w) => !!window && inRange(w.meetingDate, window) };
}

/**
 * Everything the screen shows for a window: the weeks inside it, the scored rows and the dropdown options.
 * Windows: the last 6 months (BNI's rule, anchored on the newest imported meeting — the default), every imported
 * week, one week, or a custom date range.
 */
export function buildTrafficView(input: {
  palms: PalmsWeekRecord[];
  sponsors: SponsorWeekRecord[];
  choice?: string;
  custom?: PeriodWindow;
}): TrafficView {
  const weeks = listWeeks(input.palms, input.sponsors);
  const resolved = windowOf(input.choice ?? LAST_6_MONTHS, weeks, input.custom);
  const palmsWeeks = weeks.filter((w) => w.hasPalms);
  const selected = palmsWeeks.filter(resolved.pick);
  const meetingSet = new Set(selected.map((w) => w.meetingDate));
  const window = resolved.window ?? { from: '', to: '' };

  const rows = sortTrafficRows(
    buildTrafficRows({
      palms: input.palms.filter((r) => meetingSet.has(r.meetingDate)),
      sponsors: input.sponsors.filter((r) => meetingSet.has(r.meetingDate)),
      window,
      meetings: selected.length,
    }),
  );
  const sponsorWeeks = new Set(weeks.filter((w) => w.hasSponsorReport).map((w) => weekKey(w.weekFrom, w.weekTo)));
  const sponsorWeeksMissing = selected.filter((w) => !sponsorWeeks.has(weekKey(w.weekFrom, w.weekTo))).length;

  const last6 = rollingWindow(latestDate(palmsWeeks.map((w) => w.meetingDate)));
  const last6Count = last6 ? palmsWeeks.filter((w) => inRange(w.meetingDate, last6)).length : 0;
  const options: WindowOption[] = [
    { value: LAST_6_MONTHS, label: `Last 6 months (${last6Count} ${last6Count === 1 ? 'week' : 'weeks'})` },
    { value: ALL_WEEKS, label: `All imported weeks (${palmsWeeks.length})` },
    ...[...palmsWeeks].reverse().map((w) => ({ value: `${WEEK_PREFIX}${w.meetingDate}`, label: `Week of ${rangeLabel(w.meetingDate, w.meetingDate)}` })),
    { value: CUSTOM_RANGE, label: 'Custom range…' },
  ];

  const label =
    resolved.choice === LAST_6_MONTHS
      ? `Last 6 months · ${window.from ? rangeLabel(window.from, window.to) : '—'} · ${selected.length} ${selected.length === 1 ? 'week' : 'weeks'}`
      : resolved.choice === ALL_WEEKS
        ? `All imported weeks · ${window.from ? rangeLabel(window.from, window.to) : '—'} · ${selected.length} weeks`
        : resolved.choice === CUSTOM_RANGE
          ? `${rangeLabel(window.from, window.to)} · ${selected.length} ${selected.length === 1 ? 'week' : 'weeks'}`
          : `Week of ${rangeLabel(window.from, window.to)}`;

  return {
    choice: resolved.choice,
    options,
    from: window.from,
    to: window.to,
    label,
    meetings: selected.length,
    rows,
    weeks,
    sponsorWeeksMissing,
    empty: selected.length === 0,
  };
}
