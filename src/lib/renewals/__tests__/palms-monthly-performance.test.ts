import { describe, expect, it } from "vitest";
import {
  buildMonthlyPalmsPerformance,
  getMissingPalmsMonths,
  isExactMonthlyPalmsSnapshot,
  isExactMonthlyPalmsWindow,
} from "../palms-monthly-performance";
import type { MemberPalmsSnapshot } from "../types";

function snapshot(reportFrom: string, reportTo: string, overrides: Partial<MemberPalmsSnapshot> = {}): MemberPalmsSnapshot {
  return {
    id: `${reportFrom}-${reportTo}`,
    member_id: "member-1",
    chapter_name: "Influencers",
    report_from: reportFrom,
    report_to: reportTo,
    run_at: null,
    present_count: 4,
    absent_count: 1,
    late_count: 0,
    medical_count: 0,
    substitute_count: 0,
    referrals_given_inside: 2,
    referrals_given_outside: 1,
    referrals_received_inside: 3,
    referrals_received_outside: 1,
    visitors: 2,
    one_to_ones: 5,
    tyfcb: 1000,
    ceu: 1,
    trainings: 1,
    import_batch_id: null,
    ...overrides,
  };
}

describe("monthly PALMS performance", () => {
  it("recognizes exact monthly PALMS windows", () => {
    expect(isExactMonthlyPalmsSnapshot(snapshot("2026-03-01", "2026-03-31"))).toBe(true);
    expect(isExactMonthlyPalmsSnapshot(snapshot("2025-10-01", "2026-03-31"))).toBe(false);
    expect(
      isExactMonthlyPalmsWindow({
        report_from: "2026-04-01",
        report_to: "2026-04-30",
      }),
    ).toBe(true);
    expect(
      isExactMonthlyPalmsWindow({
        report_from: "2026-04-02",
        report_to: "2026-04-30",
      }),
    ).toBe(false);
  });

  it("builds exact yearly totals from the latest 12 monthly PALMS files", () => {
    const snapshots = [
      snapshot("2025-01-01", "2025-01-31"),
      snapshot("2025-02-01", "2025-02-28"),
      snapshot("2025-03-01", "2025-03-31"),
      snapshot("2025-04-01", "2025-04-30"),
      snapshot("2025-05-01", "2025-05-31"),
      snapshot("2025-06-01", "2025-06-30"),
      snapshot("2025-07-01", "2025-07-31"),
      snapshot("2025-08-01", "2025-08-31"),
      snapshot("2025-09-01", "2025-09-30"),
      snapshot("2025-10-01", "2025-10-31"),
      snapshot("2025-11-01", "2025-11-30"),
      snapshot("2025-12-01", "2025-12-31"),
      snapshot("2026-01-01", "2026-01-31"),
    ];

    const result = buildMonthlyPalmsPerformance(snapshots);

    expect(result.monthsCovered).toBe(12);
    expect(result.monthlySnapshots[0].report_to).toBe("2025-02-28");
    expect(result.monthlySnapshots[11].report_to).toBe("2026-01-31");
    expect(result.totals.presents).toBe(48);
    expect(result.totals.referralsGiven).toBe(36);
    expect(result.totals.oneToOnes).toBe(60);
    expect(result.totals.tyfcb).toBe(12000);
  });

  it("builds exact yearly totals from monthly PALMS files inside the anchor window", () => {
    const snapshots = [
      snapshot("2025-03-01", "2025-03-31", { present_count: 30 }),
      snapshot("2025-04-01", "2025-04-30", { present_count: 4 }),
      snapshot("2025-05-01", "2025-05-31", { present_count: 5 }),
      snapshot("2025-06-01", "2025-06-30", { present_count: 6 }),
      snapshot("2025-07-01", "2025-07-31", { present_count: 7 }),
      snapshot("2025-08-01", "2025-08-31", { present_count: 8 }),
      snapshot("2025-09-01", "2025-09-30", { present_count: 9 }),
      snapshot("2025-10-01", "2025-10-31", { present_count: 10 }),
      snapshot("2025-11-01", "2025-11-30", { present_count: 11 }),
      snapshot("2025-12-01", "2025-12-31", { present_count: 12 }),
      snapshot("2026-01-01", "2026-01-31", { present_count: 13 }),
      snapshot("2026-02-01", "2026-02-28", { present_count: 14 }),
      snapshot("2026-03-01", "2026-03-31", { present_count: 15 }),
      snapshot("2026-04-01", "2026-04-30", { present_count: 40 }),
    ];

    const result = buildMonthlyPalmsPerformance(snapshots, { anchorDate: "2026-03-31" });

    expect(result.monthsCovered).toBe(12);
    expect(result.monthlySnapshots[0].report_to).toBe("2025-04-30");
    expect(result.monthlySnapshots[11].report_to).toBe("2026-03-31");
    expect(result.monthlySnapshots.map((item) => item.report_from)).not.toContain("2025-03-01");
    expect(result.monthlySnapshots.map((item) => item.report_from)).not.toContain("2026-04-01");
    expect(result.totals.presents).toBe(114);
  });

  it("builds six-month totals inside the anchored window", () => {
    const snapshots = [
      snapshot("2025-09-01", "2025-09-30", { present_count: 30 }),
      snapshot("2025-10-01", "2025-10-31", { present_count: 1 }),
      snapshot("2025-11-01", "2025-11-30", { present_count: 2 }),
      snapshot("2025-12-01", "2025-12-31", { present_count: 3 }),
      snapshot("2026-01-01", "2026-01-31", { present_count: 4 }),
      snapshot("2026-02-01", "2026-02-28", { present_count: 5 }),
      snapshot("2026-03-01", "2026-03-31", { present_count: 6 }),
      snapshot("2026-04-01", "2026-04-30", { present_count: 40 }),
    ];

    const result = buildMonthlyPalmsPerformance(snapshots, {
      anchorDate: "2026-03-31",
      limit: 6,
      windowMonths: 6,
    });

    expect(result.monthsCovered).toBe(6);
    expect(result.monthlySnapshots.map((item) => item.report_from)).toEqual([
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(result.totals.presents).toBe(21);
  });

  it("detects missing months between uploaded monthly PALMS windows", () => {
    const missingMonths = getMissingPalmsMonths([
      {
        chapterName: "Influencers",
        reportFrom: "2025-10-01",
        reportTo: "2025-10-31",
        filename: "oct.xls",
        createdAt: "2026-04-22T00:00:00.000Z",
      },
      {
        chapterName: "Influencers",
        reportFrom: "2025-11-01",
        reportTo: "2025-11-30",
        filename: "nov.xls",
        createdAt: "2026-04-22T00:00:00.000Z",
      },
      {
        chapterName: "Influencers",
        reportFrom: "2026-01-01",
        reportTo: "2026-01-31",
        filename: "jan.xls",
        createdAt: "2026-04-22T00:00:00.000Z",
      },
    ]);

    expect(missingMonths).toEqual(["2025-12-01"]);
  });
});
