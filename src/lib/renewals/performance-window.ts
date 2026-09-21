export type PerformanceWindow = {
  anchorDate: string;
  windowStart: string;
};

function parseDateOnly(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getPerformanceWindow(
  anchorDateInput: string | Date,
  periodMonths = 12,
): PerformanceWindow | null {
  const anchorDate =
    typeof anchorDateInput === "string" ? parseDateOnly(anchorDateInput) : new Date(anchorDateInput);

  if (!anchorDate || Number.isNaN(anchorDate.getTime()) || periodMonths < 1) {
    return null;
  }

  const priorMonth = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() - periodMonths, 1),
  );
  const priorMonthLastDay = new Date(
    Date.UTC(priorMonth.getUTCFullYear(), priorMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const priorDate = new Date(
    Date.UTC(
      priorMonth.getUTCFullYear(),
      priorMonth.getUTCMonth(),
      Math.min(anchorDate.getUTCDate(), priorMonthLastDay),
    ),
  );
  priorDate.setUTCDate(priorDate.getUTCDate() + 1);

  return {
    anchorDate: formatDateOnly(anchorDate),
    windowStart: formatDateOnly(priorDate),
  };
}
