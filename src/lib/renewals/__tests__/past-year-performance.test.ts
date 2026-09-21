import { describe, expect, it } from "vitest";
import { buildPastYearPerformance } from "../past-year-performance";
import type { MemberTrafficLight } from "../types";

function trafficLight(reportMonth: string, overrides: Partial<MemberTrafficLight> = {}): MemberTrafficLight {
  return {
    id: reportMonth,
    member_id: "member-1",
    report_month: reportMonth,
    report_window_start: null,
    report_window_end: reportMonth,
    score: 50,
    color: "yellow",
    present_count: 4,
    absent_count: 1,
    late_count: 0,
    medical_count: 0,
    substitute_count: 0,
    referrals_given: 2,
    referrals_received: 3,
    visitors: 1,
    testimonials: 1,
    tyfcb: 1000,
    trainings: 1,
    week_count: 4,
    import_batch_id: null,
    ...overrides,
  };
}

describe("buildPastYearPerformance", () => {
  it("aggregates the latest twelve months of traffic-light history", () => {
    const months = [
      "2025-01-01",
      "2025-02-01",
      "2025-03-01",
      "2025-04-01",
      "2025-05-01",
      "2025-06-01",
      "2025-07-01",
      "2025-08-01",
      "2025-09-01",
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ];
    const history = months.map((month, index) =>
      trafficLight(month, { score: 40 + index }),
    );

    const result = buildPastYearPerformance(history);

    expect(result.snapshotsCovered).toBe(12);
    expect(result.history).toHaveLength(12);
    expect(result.history[0].report_month).toBe("2025-02-01");
    expect(result.history[11].report_month).toBe("2026-01-01");
    expect(result.scores.best).toBe(52);
    expect(result.scores.worst).toBe(41);
  });

  it("returns an empty summary when no history exists", () => {
    const result = buildPastYearPerformance([]);

    expect(result.snapshotsCovered).toBe(0);
    expect(result.scores.average).toBeNull();
  });

  it("aggregates only the latest six traffic-light snapshots when requested", () => {
    const history = [
      "2025-06-01",
      "2025-07-01",
      "2025-08-01",
      "2025-09-01",
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
    ].map((month, index) => trafficLight(month, { score: 40 + index }));

    const result = buildPastYearPerformance(history, 6);

    expect(result.snapshotsCovered).toBe(6);
    expect(result.history[0].report_month).toBe("2025-07-01");
    expect(result.history[5].report_month).toBe("2025-12-01");
    expect(result.scores.average).toBe(43.5);
  });
});
