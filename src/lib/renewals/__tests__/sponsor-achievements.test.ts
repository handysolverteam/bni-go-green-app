import { describe, expect, it } from "vitest";
import { buildSponsorAchievementSummary } from "../sponsor-achievements";
import type { MemberSponsorAchievement } from "../types";

const sponsorAchievements: MemberSponsorAchievement[] = [
  {
    id: "1",
    member_id: "member-1",
    sponsored_first_name: "Jasmeet",
    sponsored_last_name: "Singh",
    sponsored_full_name: "Jasmeet Singh",
    sponsored_region: "Gurgaon",
    sponsored_chapter: "Influencers",
    application_date: "2025-06-12",
    import_batch_id: "batch-1",
  },
  {
    id: "2",
    member_id: "member-1",
    sponsored_first_name: "Aman",
    sponsored_last_name: "Kapoor",
    sponsored_full_name: "Aman Kapoor",
    sponsored_region: "Gurgaon",
    sponsored_chapter: "Explorers",
    application_date: "2024-03-01",
    import_batch_id: "batch-1",
  },
];

describe("buildSponsorAchievementSummary", () => {
  it("builds lifetime and past-year sections using a rolling 365-day window", () => {
    const summary = buildSponsorAchievementSummary(
      sponsorAchievements,
      new Date("2026-04-22T00:00:00.000Z"),
    );

    expect(summary.lifetimeCount).toBe(2);
    expect(summary.pastYearCount).toBe(1);
    expect(summary.pastYearSponsors[0].sponsored_full_name).toBe("Jasmeet Singh");
    expect(summary.lifetimeSponsors[0].application_date).toBe("2025-06-12");
  });

  it("returns empty sections when there are no sponsor achievements", () => {
    const summary = buildSponsorAchievementSummary([], new Date("2026-04-22T00:00:00.000Z"));

    expect(summary.lifetimeCount).toBe(0);
    expect(summary.pastYearCount).toBe(0);
    expect(summary.lifetimeSponsors).toEqual([]);
    expect(summary.pastYearSponsors).toEqual([]);
  });
});
