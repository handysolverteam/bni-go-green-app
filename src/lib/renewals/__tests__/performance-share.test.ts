import { describe, expect, it } from "vitest";
import { buildMemberPerformanceShareText } from "../performance-share";
import { buildPastYearTrainingPerformance } from "../past-year-training-performance";
import { buildMonthlyPalmsPerformance } from "../palms-monthly-performance";
import { buildPastYearPerformance } from "../past-year-performance";
import type { MemberPalmsSnapshot, MemberTrafficLight, MemberTrainingAchievement } from "../types";

const palmsSnapshots: MemberPalmsSnapshot[] = [
  {
    id: "palms-1",
    member_id: "member-1",
    chapter_name: "Influencers",
    report_from: "2026-02-01",
    report_to: "2026-02-28",
    run_at: "2026-03-01T00:00:00.000Z",
    present_count: 10,
    absent_count: 1,
    late_count: 0,
    medical_count: 0,
    substitute_count: 0,
    referrals_given_inside: 3,
    referrals_given_outside: 4,
    referrals_received_inside: 5,
    referrals_received_outside: 1,
    visitors: 2,
    one_to_ones: 6,
    tyfcb: 150000,
    ceu: 2,
    trainings: 1,
    import_batch_id: "batch-1",
  },
  {
    id: "palms-2",
    member_id: "member-1",
    chapter_name: "Influencers",
    report_from: "2026-03-01",
    report_to: "2026-03-31",
    run_at: "2026-04-01T00:00:00.000Z",
    present_count: 11,
    absent_count: 0,
    late_count: 1,
    medical_count: 0,
    substitute_count: 0,
    referrals_given_inside: 2,
    referrals_given_outside: 5,
    referrals_received_inside: 4,
    referrals_received_outside: 2,
    visitors: 3,
    one_to_ones: 7,
    tyfcb: 250000,
    ceu: 1,
    trainings: 2,
    import_batch_id: "batch-1",
  },
];

const trafficLights: MemberTrafficLight[] = [
  {
    id: "tl-1",
    member_id: "member-1",
    report_month: "2026-03-01",
    report_window_start: "2025-10-01",
    report_window_end: "2026-03-01",
    score: 70,
    color: "green",
    present_count: 0,
    absent_count: 0,
    late_count: 0,
    medical_count: 0,
    substitute_count: 0,
    referrals_given: 0,
    referrals_received: 0,
    visitors: 0,
    testimonials: 0,
    tyfcb: null,
    trainings: 0,
    week_count: 26,
    import_batch_id: "batch-1",
  },
  {
    id: "tl-2",
    member_id: "member-1",
    report_month: "2026-02-01",
    report_window_start: "2025-09-01",
    report_window_end: "2026-02-01",
    score: 55,
    color: "yellow",
    present_count: 0,
    absent_count: 0,
    late_count: 0,
    medical_count: 0,
    substitute_count: 0,
    referrals_given: 0,
    referrals_received: 0,
    visitors: 0,
    testimonials: 0,
    tyfcb: null,
    trainings: 0,
    week_count: 26,
    import_batch_id: "batch-1",
  },
];

const trainingAchievements: MemberTrainingAchievement[] = [
  {
    id: "training-1",
    member_id: "member-1",
    chapter_name: "Influencers",
    region_name: "Gurgaon",
    event_date: "2025-06-07",
    event_type: "Leadership Team Roundtable - India",
    role: null,
    join_date: null,
    induction_date: null,
    import_batch_id: "batch-1",
  },
  {
    id: "training-2",
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

describe("buildMemberPerformanceShareText", () => {
  it("builds a WhatsApp-ready past year performance summary", () => {
    const text = buildMemberPerformanceShareText({
      memberName: "Viraj Bansal",
      palmsPerformance: buildMonthlyPalmsPerformance(palmsSnapshots),
      palmsRange: "1 Feb 2026 to 31 Mar 2026",
      trainingPerformance: buildPastYearTrainingPerformance(trainingAchievements, "2026-03-31"),
      trainingRange: "1 Apr 2025 to 31 Mar 2026",
      trafficLightPerformance: buildPastYearPerformance(trafficLights),
      trafficLightRange: "Sep 2025 to Mar 2026",
    });

    expect(text).toContain("🌟 Past year performance of Viraj Bansal 🌟");
    expect(text).toContain("📅 Monthly PALMS coverage: 2 months");
    expect(text).toContain("📌 PALMS range: 1 Feb 2026 to 31 Mar 2026");
    expect(text).toContain("🚦 Traffic-light range: Sep 2025 to Mar 2026");
    expect(text).toContain("📚 Training range: 1 Apr 2025 to 31 Mar 2026");
    expect(text).toContain("🤝 Referrals given: 14");
    expect(text).toContain("📥 Referrals received: 12");
    expect(text).toContain("🙌 Visitors: 5");
    expect(text).toContain("👥 1-to-1s: 13");
    expect(text).toContain("🎓 CEU: 3");
    expect(text).toContain("📚 Trainings: 1");
    expect(text).toContain("📊 Averages:");
    expect(text).toContain("🤝 Referrals / week: 0.27");
    expect(text).toContain("👥 1-to-1s / week: 0.25");
    expect(text).toContain("🙌 Visitors / month: 0.42");
    expect(text).toContain("📚 Trainings / month: 0.08");
    expect(text).toContain("📈 Traffic-light score: Avg 62.5 | Best 70 | Worst 55");
    expect(text).toContain("🚦 Last 12 traffic-light snapshots:");
    expect(text).toContain("Mar 70 🟢");
    expect(text).toContain("Feb 55 🟡");
    expect(text).toContain("🗓️ Performance updated till 31 Mar 2026");
    expect(text).toContain("Regards,\nRetention and Renewal Coordinators\nTeam Moneyfestation");
    expect(text).not.toContain("Congratulations on the consistency and contribution");
    expect(text).not.toMatch(/Ã|ðŸ|â/);
  });

  it("falls back gracefully when yearly data is missing", () => {
    const text = buildMemberPerformanceShareText({
      memberName: "Member One",
      palmsPerformance: buildMonthlyPalmsPerformance([]),
      palmsRange: null,
      trainingPerformance: buildPastYearTrainingPerformance([], "2026-03-31"),
      trainingRange: "1 Apr 2025 to 31 Mar 2026",
      trafficLightPerformance: buildPastYearPerformance([]),
      trafficLightRange: null,
    });

    expect(text).toContain("📅 Monthly PALMS coverage: 0 months");
    expect(text).toContain("🤝 Referrals given: 0");
    expect(text).toContain("📚 Trainings: 0");
    expect(text).toContain("📊 Averages:");
    expect(text).not.toContain("Last 12 traffic-light snapshots:");
    expect(text).not.toContain("Performance updated till");
  });

  it("labels the six-month WhatsApp summary and traffic-light history", () => {
    const text = buildMemberPerformanceShareText({
      memberName: "Viraj Bansal",
      periodMonths: 6,
      palmsPerformance: buildMonthlyPalmsPerformance(palmsSnapshots, {
        anchorDate: "2026-03-31",
        limit: 6,
        windowMonths: 6,
      }),
      palmsRange: "1 Oct 2025 to 31 Mar 2026",
      trainingPerformance: buildPastYearTrainingPerformance(
        trainingAchievements,
        "2026-03-31",
        6,
      ),
      trainingRange: "1 Oct 2025 to 31 Mar 2026",
      trafficLightPerformance: buildPastYearPerformance(trafficLights, 6),
      trafficLightRange: "Oct 2025 to Mar 2026",
    });

    expect(text).toContain("🌟 Past 6 months performance of Viraj Bansal 🌟");
    expect(text).toContain("🚦 Last 6 traffic-light snapshots:");
    expect(text).not.toContain("Past year performance");
    expect(text).not.toContain("Last 12 traffic-light snapshots:");
  });
});
