export type PerformanceAverages = {
  referralsGivenPerWeek: number | null;
  oneToOnesPerWeek: number | null;
  visitorsPerMonth: number | null;
  trainingsPerMonth: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12;

function parseDateOnly(date: string | null): Date | null {
  if (!date) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundAverage(value: number): number {
  return Number(value.toFixed(2));
}

function getMonthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function getMonthCount(from: Date, to: Date, days: number): number {
  if (from.getUTCDate() === 1 && to.getUTCDate() === getMonthEnd(to).getUTCDate()) {
    return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
  }

  return days / AVERAGE_DAYS_PER_MONTH;
}

export function buildPerformanceAverages({
  reportFrom,
  reportTo,
  referralsGiven,
  oneToOnes,
  visitors,
  trainings,
}: {
  reportFrom: string | null;
  reportTo: string | null;
  referralsGiven: number;
  oneToOnes: number | null;
  visitors: number;
  trainings: number;
}): PerformanceAverages {
  const from = parseDateOnly(reportFrom);
  const to = parseDateOnly(reportTo);

  if (!from || !to || to.getTime() < from.getTime()) {
    return {
      referralsGivenPerWeek: null,
      oneToOnesPerWeek: null,
      visitorsPerMonth: null,
      trainingsPerMonth: null,
    };
  }

  const days = (to.getTime() - from.getTime()) / MS_PER_DAY + 1;
  const weeks = days / 7;
  const months = getMonthCount(from, to, days);

  return {
    referralsGivenPerWeek: roundAverage(referralsGiven / weeks),
    oneToOnesPerWeek: oneToOnes === null ? null : roundAverage(oneToOnes / weeks),
    visitorsPerMonth: roundAverage(visitors / months),
    trainingsPerMonth: roundAverage(trainings / months),
  };
}
