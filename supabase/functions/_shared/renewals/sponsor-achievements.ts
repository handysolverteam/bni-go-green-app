// Direct port of bni-rrc's lib/renewals/sponsor-achievements.ts (also
// ported for the client bundle at src/lib/renewals/sponsor-achievements.ts).
// Pure, Deno-compatible.

import type { MemberSponsorAchievement, SponsorAchievementSummary } from "./types.ts";

export function isWithinPastYear(date: string, today = new Date()): boolean {
  const applicationDate = new Date(`${date}T00:00:00.000Z`);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  return applicationDate >= cutoff;
}

export function sortSponsorAchievementsForDisplay(
  achievements: MemberSponsorAchievement[],
): MemberSponsorAchievement[] {
  return [...achievements].sort((left, right) => {
    if (left.application_date === right.application_date) {
      return left.sponsored_full_name.localeCompare(right.sponsored_full_name);
    }

    return right.application_date.localeCompare(left.application_date);
  });
}

export function buildSponsorAchievementSummary(
  sponsorAchievements: MemberSponsorAchievement[],
  today = new Date(),
): SponsorAchievementSummary {
  const lifetimeSponsors = sortSponsorAchievementsForDisplay(sponsorAchievements);
  const pastYearSponsors = lifetimeSponsors.filter((achievement) => isWithinPastYear(achievement.application_date, today));

  return {
    lifetimeSponsors,
    pastYearSponsors,
    lifetimeCount: lifetimeSponsors.length,
    pastYearCount: pastYearSponsors.length,
  };
}
