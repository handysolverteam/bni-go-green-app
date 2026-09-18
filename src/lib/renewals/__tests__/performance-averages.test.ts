import { describe, expect, it } from "vitest";
import { buildPerformanceAverages } from "../performance-averages";

describe("buildPerformanceAverages", () => {
  it("builds weekly and monthly averages from an inclusive report window", () => {
    const averages = buildPerformanceAverages({
      reportFrom: "2026-01-01",
      reportTo: "2026-01-31",
      referralsGiven: 31,
      oneToOnes: 62,
      visitors: 10,
      trainings: 2,
    });

    expect(averages.referralsGivenPerWeek).toBe(7);
    expect(averages.oneToOnesPerWeek).toBe(14);
    expect(averages.visitorsPerMonth).toBe(10);
    expect(averages.trainingsPerMonth).toBe(2);
  });

  it("returns empty averages when the report window is missing", () => {
    const averages = buildPerformanceAverages({
      reportFrom: null,
      reportTo: null,
      referralsGiven: 31,
      oneToOnes: 62,
      visitors: 10,
      trainings: 2,
    });

    expect(averages.referralsGivenPerWeek).toBeNull();
    expect(averages.oneToOnesPerWeek).toBeNull();
    expect(averages.visitorsPerMonth).toBeNull();
    expect(averages.trainingsPerMonth).toBeNull();
  });
});
