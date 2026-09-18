// Extracted from bni-rrc's lib/renewals/palms-monthly-performance.ts — only
// the two window-math functions needed by palms-database-import.ts and
// import-coverage.ts are ported here; the rest of that file (monthly
// performance aggregation for dashboards) belongs to a future Phase 3 read
// endpoint, not these DB-writing functions. Pure, Deno-compatible.

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

export function isExactMonthlyPalmsSnapshot(snapshot: MonthlyPalmsWindowLike): boolean {
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
