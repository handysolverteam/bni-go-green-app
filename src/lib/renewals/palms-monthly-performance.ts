import type { MemberPalmsSnapshot } from "./types";
import { getPerformanceWindow } from "./performance-window";

export type MonthlyPalmsPerformance = {
  monthlySnapshots: MemberPalmsSnapshot[];
  monthsCovered: number;
  totals: {
    presents: number;
    absences: number;
    late: number;
    medical: number;
    substitute: number;
    referralsGiven: number;
    referralsReceived: number;
    visitors: number;
    oneToOnes: number;
    tyfcb: number | null;
    ceu: number;
    trainings: number;
  };
};

export type MonthlyPalmsWindowLike = {
  report_from: string;
  report_to: string;
};

export type PalmsMonthlyCoverageEntry = {
  chapterName: string | null;
  reportFrom: string;
  reportTo: string;
  filename: string | null;
  createdAt: string | null;
};

export type MonthlyPalmsPerformanceOptions = {
  anchorDate?: string | Date;
  limit?: number;
  windowMonths?: number;
};

function getMonthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function parseDateOnly(date: string): Date | null {
  const dateOnlyMatch = date.match(/^(\d{4}-\d{2}-\d{2})/);
  const parsed = new Date(`${dateOnlyMatch?.[1] ?? date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isExactMonthlyPalmsWindow(window: MonthlyPalmsWindowLike): boolean {
  const from = parseDateOnly(window.report_from);
  const to = parseDateOnly(window.report_to);

  if (!from || !to) {
    return false;
  }

  return (
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCDate() === 1 &&
    to.getUTCDate() === getMonthEnd(from).getUTCDate()
  );
}

export function isExactMonthlyPalmsSnapshot(snapshot: MemberPalmsSnapshot): boolean {
  return isExactMonthlyPalmsWindow(snapshot);
}

function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function formatMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function getMissingPalmsMonths(entries: PalmsMonthlyCoverageEntry[]): string[] {
  const monthlyEntries = entries
    .filter((entry) => isExactMonthlyPalmsWindow({ report_from: entry.reportFrom, report_to: entry.reportTo }))
    .sort((left, right) => left.reportFrom.localeCompare(right.reportFrom));

  if (monthlyEntries.length < 2) {
    return [];
  }

  const existingMonths = new Set(monthlyEntries.map((entry) => entry.reportFrom));
  const missingMonths: string[] = [];
  let cursor = parseDateOnly(monthlyEntries[0].reportFrom);
  const end = parseDateOnly(monthlyEntries[monthlyEntries.length - 1].reportFrom);

  if (!cursor || !end) {
    return [];
  }

  while (cursor.getTime() <= end.getTime()) {
    const month = formatMonthStart(cursor);

    if (!existingMonths.has(month)) {
      missingMonths.push(month);
    }

    cursor = addMonths(cursor, 1);
  }

  return missingMonths;
}

export function buildMonthlyPalmsPerformance(
  snapshots: MemberPalmsSnapshot[],
  options: MonthlyPalmsPerformanceOptions | number = {},
): MonthlyPalmsPerformance {
  const resolvedOptions = typeof options === "number" ? { limit: options } : options;
  const windowMonths = resolvedOptions.windowMonths ?? 12;
  const limit = resolvedOptions.limit ?? windowMonths;
  const performanceWindow = resolvedOptions.anchorDate
    ? getPerformanceWindow(resolvedOptions.anchorDate, windowMonths)
    : null;
  const monthlySnapshots = [...snapshots]
    .filter(isExactMonthlyPalmsSnapshot)
    .filter((snapshot) => {
      if (!performanceWindow) {
        return true;
      }

      return (
        snapshot.report_from >= performanceWindow.windowStart &&
        snapshot.report_to <= performanceWindow.anchorDate
      );
    })
    .sort((left, right) => right.report_to.localeCompare(left.report_to))
    .slice(0, limit)
    .sort((left, right) => left.report_to.localeCompare(right.report_to));

  if (monthlySnapshots.length === 0) {
    return {
      monthlySnapshots: [],
      monthsCovered: 0,
      totals: {
        presents: 0,
        absences: 0,
        late: 0,
        medical: 0,
        substitute: 0,
        referralsGiven: 0,
        referralsReceived: 0,
        visitors: 0,
        oneToOnes: 0,
        tyfcb: null,
        ceu: 0,
        trainings: 0,
      },
    };
  }

  return {
    monthlySnapshots,
    monthsCovered: monthlySnapshots.length,
    totals: {
      presents: monthlySnapshots.reduce((sum, item) => sum + item.present_count, 0),
      absences: monthlySnapshots.reduce((sum, item) => sum + item.absent_count, 0),
      late: monthlySnapshots.reduce((sum, item) => sum + item.late_count, 0),
      medical: monthlySnapshots.reduce((sum, item) => sum + item.medical_count, 0),
      substitute: monthlySnapshots.reduce((sum, item) => sum + item.substitute_count, 0),
      referralsGiven: monthlySnapshots.reduce(
        (sum, item) => sum + item.referrals_given_inside + item.referrals_given_outside,
        0,
      ),
      referralsReceived: monthlySnapshots.reduce(
        (sum, item) => sum + item.referrals_received_inside + item.referrals_received_outside,
        0,
      ),
      visitors: monthlySnapshots.reduce((sum, item) => sum + item.visitors, 0),
      oneToOnes: monthlySnapshots.reduce((sum, item) => sum + item.one_to_ones, 0),
      tyfcb: monthlySnapshots.reduce((sum, item) => sum + (item.tyfcb ?? 0), 0),
      ceu: monthlySnapshots.reduce((sum, item) => sum + item.ceu, 0),
      trainings: monthlySnapshots.reduce((sum, item) => sum + item.trainings, 0),
    },
  };
}
