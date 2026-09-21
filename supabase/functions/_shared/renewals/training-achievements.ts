// Direct port of bni-rrc's lib/renewals/training-achievements.ts (also
// ported for the client bundle at src/lib/renewals/training-achievements.ts).
// Pure, Deno-compatible.

import type { MemberTrainingAchievement, TrainingAchievementSummary } from "./types.ts";

export function isWithinPastYear(date: string, today = new Date()): boolean {
  const applicationDate = new Date(`${date}T00:00:00.000Z`);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  return applicationDate >= cutoff;
}

export function sortTrainingAchievementsForDisplay(
  achievements: MemberTrainingAchievement[],
): MemberTrainingAchievement[] {
  return [...achievements].sort((left, right) => {
    if (left.event_date === right.event_date) {
      return left.event_type.localeCompare(right.event_type);
    }

    return right.event_date.localeCompare(left.event_date);
  });
}

export function buildTrainingAchievementSummary(
  trainingAchievements: MemberTrainingAchievement[],
  today = new Date(),
): TrainingAchievementSummary {
  const lifetimeTrainings = sortTrainingAchievementsForDisplay(trainingAchievements);
  const pastYearTrainings = lifetimeTrainings.filter((achievement) => isWithinPastYear(achievement.event_date, today));

  return {
    lifetimeTrainings,
    pastYearTrainings,
    lifetimeCount: lifetimeTrainings.length,
    pastYearCount: pastYearTrainings.length,
  };
}
