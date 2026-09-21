import { describe, expect, it } from "vitest";
import { buildMemberAchievements, selectLifetimePalmsSnapshot } from "../achievements";
import type { MemberPalmsSnapshot, MemberTrafficLight } from "../types";

const palmsSnapshot: MemberPalmsSnapshot = {
  id: "palms-1",
  member_id: "member-1",
  chapter_name: "Influencers",
  report_from: "2015-10-01",
  report_to: "2026-03-31",
  run_at: "2026-04-21T05:29:34.000Z",
  present_count: 100,
  absent_count: 2,
  late_count: 1,
  medical_count: 3,
  substitute_count: 4,
  referrals_given_inside: 10,
  referrals_given_outside: 20,
  referrals_received_inside: 30,
  referrals_received_outside: 40,
  visitors: 50,
  one_to_ones: 60,
  tyfcb: 700000,
  ceu: 8,
  trainings: 9,
  import_batch_id: "batch-1",
};

const trafficLights: MemberTrafficLight[] = [
  {
    id: "tl-1",
    member_id: "member-1",
    report_month: "2026-03-01",
    report_window_start: null,
    report_window_end: "2026-03-01",
    score: 80,
    color: "green",
    present_count: 4,
    absent_count: 0,
    late_count: 1,
    medical_count: 0,
    substitute_count: 0,
    referrals_given: 3,
    referrals_received: 4,
    visitors: 2,
    testimonials: 1,
    tyfcb: 1000,
    trainings: 2,
    week_count: 4,
    import_batch_id: "batch-1",
  },
  {
    id: "tl-2",
    member_id: "member-1",
    report_month: "2026-02-01",
    report_window_start: null,
    report_window_end: "2026-02-01",
    score: 60,
    color: "yellow",
    present_count: 3,
    absent_count: 1,
    late_count: 0,
    medical_count: 1,
    substitute_count: 1,
    referrals_given: 5,
    referrals_received: 6,
    visitors: 1,
    testimonials: 2,
    tyfcb: 2000,
    trainings: 1,
    week_count: 4,
    import_batch_id: "batch-1",
  },
];

describe("buildMemberAchievements", () => {
  it("prefers broad PALMS snapshots over newer exact monthly PALMS snapshots", () => {
    const monthlySnapshot: MemberPalmsSnapshot = {
      ...palmsSnapshot,
      id: "palms-monthly",
      report_from: "2026-04-01",
      report_to: "2026-04-30",
      present_count: 5,
    };

    const selectedSnapshot = selectLifetimePalmsSnapshot([palmsSnapshot, monthlySnapshot]);

    expect(selectedSnapshot?.id).toBe("palms-1");
    expect(selectedSnapshot?.present_count).toBe(100);
  });

  it("prefers the latest PALMS snapshot when present", () => {
    const achievements = buildMemberAchievements(palmsSnapshot, trafficLights);

    expect(achievements.source).toBe("palms");
    expect(achievements.attendance.presents).toBe(100);
    expect(achievements.referrals.givenTotal).toBe(30);
    expect(achievements.tyfcb).toBe(700000);
    expect(achievements.oneToOnes).toBe(60);
  });

  it("falls back to traffic-light history when PALMS data is missing", () => {
    const achievements = buildMemberAchievements(null, trafficLights);

    expect(achievements.source).toBe("traffic_lights");
    expect(achievements.attendance.presents).toBe(7);
    expect(achievements.attendance.absences).toBe(1);
    expect(achievements.referrals.givenTotal).toBe(8);
    expect(achievements.referrals.receivedTotal).toBe(10);
    expect(achievements.visitors).toBe(3);
    expect(achievements.trainings).toBe(3);
    expect(achievements.testimonials).toBe(3);
    expect(achievements.tyfcb).toBe(3000);
  });

  it("returns an empty state when no data exists", () => {
    const achievements = buildMemberAchievements(null, []);

    expect(achievements.source).toBe("none");
    expect(achievements.attendance.presents).toBe(0);
    expect(achievements.tyfcb).toBeNull();
  });
});
