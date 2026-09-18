import { describe, expect, it } from "vitest";
import { buildPastYearTrainingPerformance } from "../past-year-training-performance";
import type { MemberTrainingAchievement } from "../types";

const trainingAchievements: MemberTrainingAchievement[] = [
  {
    id: "1",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2025-04-01",
    event_type: "Power Team Workshop - India",
    role: null,
    join_date: null,
    induction_date: null,
    import_batch_id: "batch-1",
  },
  {
    id: "2",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2025-03-31",
    event_type: "Weekly Presentation Workshop - India",
    role: null,
    join_date: null,
    induction_date: null,
    import_batch_id: "batch-1",
  },
  {
    id: "3",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2026-03-31",
    event_type: "Leadership Team Roundtable - India",
    role: null,
    join_date: null,
    induction_date: null,
    import_batch_id: "batch-1",
  },
];

describe("buildPastYearTrainingPerformance", () => {
  it("uses a report-date anchored year window", () => {
    const performance = buildPastYearTrainingPerformance(trainingAchievements, "2026-03-31");

    expect(performance.windowStart).toBe("2025-04-01");
    expect(performance.anchorDate).toBe("2026-03-31");
    expect(performance.count).toBe(2);
    expect(performance.items.map((item) => item.event_date)).toEqual(["2026-03-31", "2025-04-01"]);
  });

  it("returns zero when no imported trainings fall within the anchored window", () => {
    const performance = buildPastYearTrainingPerformance(
      [trainingAchievements[1]],
      "2026-03-31",
    );

    expect(performance.count).toBe(0);
    expect(performance.items).toEqual([]);
  });

  it("uses inclusive six-month boundaries", () => {
    const performance = buildPastYearTrainingPerformance(
      [
        { ...trainingAchievements[0], id: "before", event_date: "2025-09-30" },
        { ...trainingAchievements[0], id: "start", event_date: "2025-10-01" },
        { ...trainingAchievements[0], id: "anchor", event_date: "2026-03-31" },
        { ...trainingAchievements[0], id: "after", event_date: "2026-04-01" },
      ],
      "2026-03-31",
      6,
    );

    expect(performance.windowStart).toBe("2025-10-01");
    expect(performance.anchorDate).toBe("2026-03-31");
    expect(performance.items.map((item) => item.id)).toEqual(["anchor", "start"]);
  });

  it("handles six-month windows anchored at the end of a longer month", () => {
    const performance = buildPastYearTrainingPerformance(
      [
        { ...trainingAchievements[0], id: "outside", event_date: "2025-02-28" },
        { ...trainingAchievements[0], id: "inside", event_date: "2025-03-01" },
      ],
      "2025-08-31",
      6,
    );

    expect(performance.windowStart).toBe("2025-03-01");
    expect(performance.items.map((item) => item.id)).toEqual(["inside"]);
  });
});
