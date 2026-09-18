import { describe, expect, it } from "vitest";
import { buildTrainingAchievementSummary } from "../training-achievements";
import type { MemberTrainingAchievement } from "../types";

const trainingAchievements: MemberTrainingAchievement[] = [
  {
    id: "1",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2025-06-12",
    event_type: "Power Team Workshop - India",
    role: "Member",
    join_date: "2023-07-01",
    induction_date: "2023-06-21",
    import_batch_id: "batch-1",
  },
  {
    id: "2",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2024-03-01",
    event_type: "Weekly Presentation Workshop - India",
    role: null,
    join_date: null,
    induction_date: null,
    import_batch_id: "batch-1",
  },
];

describe("buildTrainingAchievementSummary", () => {
  it("builds lifetime and past-year counts using a rolling 365-day window", () => {
    const summary = buildTrainingAchievementSummary(
      trainingAchievements,
      new Date("2026-04-22T00:00:00.000Z"),
    );

    expect(summary.lifetimeCount).toBe(2);
    expect(summary.pastYearCount).toBe(1);
    expect(summary.pastYearTrainings[0].event_type).toBe("Power Team Workshop - India");
    expect(summary.lifetimeTrainings[0].event_date).toBe("2025-06-12");
  });

  it("returns empty sections when there are no training achievements", () => {
    const summary = buildTrainingAchievementSummary([], new Date("2026-04-22T00:00:00.000Z"));

    expect(summary.lifetimeCount).toBe(0);
    expect(summary.pastYearCount).toBe(0);
    expect(summary.lifetimeTrainings).toEqual([]);
    expect(summary.pastYearTrainings).toEqual([]);
  });
});
