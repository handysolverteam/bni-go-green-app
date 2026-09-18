import type { MemberTrainingAchievement } from "./types";
import { getPerformanceWindow } from "./performance-window";

export type PastYearTrainingPerformance = {
  count: number;
  anchorDate: string;
  windowStart: string;
  items: MemberTrainingAchievement[];
};

export function buildPastYearTrainingPerformance(
  trainingAchievements: MemberTrainingAchievement[],
  anchorDateInput: string | Date,
  periodMonths = 12,
): PastYearTrainingPerformance {
  const performanceWindow = getPerformanceWindow(anchorDateInput, periodMonths);

  if (!performanceWindow) {
    throw new Error("A valid performance anchor date and period are required");
  }

  const anchorDateText = performanceWindow.anchorDate;
  const windowStartText = performanceWindow.windowStart;

  const items = [...trainingAchievements]
    .filter(
      (achievement) =>
        achievement.event_date >= windowStartText && achievement.event_date <= anchorDateText,
    )
    .sort((left, right) => {
      if (left.event_date === right.event_date) {
        return left.event_type.localeCompare(right.event_type);
      }

      return right.event_date.localeCompare(left.event_date);
    });

  return {
    count: items.length,
    anchorDate: anchorDateText,
    windowStart: windowStartText,
    items,
  };
}
