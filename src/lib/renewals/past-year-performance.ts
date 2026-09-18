import type { MemberTrafficLight } from "./types";
import { PAST_YEAR_TRAFFIC_LIGHT_LIMIT, sortTrafficLightHistoryForDisplay } from "./traffic-light-history";

export type PastYearPerformance = {
  history: MemberTrafficLight[];
  snapshotsCovered: number;
  scores: {
    average: number | null;
    best: number | null;
    worst: number | null;
  };
};

export function buildPastYearPerformance(
  history: MemberTrafficLight[],
  snapshotLimit = PAST_YEAR_TRAFFIC_LIGHT_LIMIT,
): PastYearPerformance {
  const selectedHistory = [...history]
    .sort((left, right) => right.report_month.localeCompare(left.report_month))
    .slice(0, snapshotLimit);

  const displayHistory = sortTrafficLightHistoryForDisplay(selectedHistory);
  const monthsCovered = selectedHistory.length;

  if (monthsCovered === 0) {
    return {
      history: [],
      snapshotsCovered: 0,
      scores: {
        average: null,
        best: null,
        worst: null,
      },
    };
  }

  const scoreTotal = selectedHistory.reduce((sum, item) => sum + item.score, 0);

  return {
    history: displayHistory,
    snapshotsCovered: monthsCovered,
    scores: {
      average: Number((scoreTotal / monthsCovered).toFixed(1)),
      best: Math.max(...selectedHistory.map((item) => item.score)),
      worst: Math.min(...selectedHistory.map((item) => item.score)),
    },
  };
}
