import { describe, expect, it } from "vitest";
import { buildMemberAchievementShareText } from "../achievement-share";
import { buildMemberAchievements } from "../achievements";
import type { MemberPastRoleEntry, MemberPalmsSnapshot, MemberTrafficLight } from "../types";

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

const roles: MemberPastRoleEntry[] = [
  {
    id: "past-role-1",
    member_id: "member-1",
    role_id: "role-1",
    display_order: 0,
    created_at: "2026-04-21T00:00:00.000Z",
    updated_at: "2026-04-21T00:00:00.000Z",
    role: {
      id: "role-1",
      name: "President",
      normalized_name: "president",
      created_at: "2026-04-21T00:00:00.000Z",
      updated_at: "2026-04-21T00:00:00.000Z",
    },
  },
];

describe("buildMemberAchievementShareText", () => {
  it("builds a short recognition summary from PALMS data", () => {
    const text = buildMemberAchievementShareText({
      memberName: "Viraj Bansal",
      roles,
      renewalLabel: "Renewing for 2026",
      tenureLabel: "15 years 1 month",
      joiningDateLabel: "1 Mar 2011",
      achievements: buildMemberAchievements(palmsSnapshot, trafficLights),
      trafficLightHistory: trafficLights,
    });

    expect(text).toContain("🌟 Celebrating Viraj Bansal 🌟");
    expect(text).toContain("🏆 Roles held: President");
    expect(text).toContain("🔄 Renewing for 2026");
    expect(text).toContain("📅 Member for 15 years 1 month | Joined 1 Mar 2011");
    expect(text).toContain("🤝 Referrals given: 30");
    expect(text).toContain("👥 1-to-1s done: 60");
    expect(text).toContain("💰 TYFCB: ₹7,00,000");
    expect(text).toContain("🙌 Visitors: 50");
    expect(text).toContain("✅ Absences: 2");
    expect(text).toContain("📊 Averages:");
    expect(text).toContain("🤝 Referrals / week:");
    expect(text).toContain("👥 1-to-1s / week:");
    expect(text).toContain("🙌 Visitors / month:");
    expect(text).toContain("📚 Trainings / month:");
    expect(text).toContain("🚦 Last 6 months:");
    expect(text).toContain("Mar 🟢 | Feb 🟡");
    expect(text).toContain("📌 Achievements updated till 31 Mar 2026");
    expect(text).not.toContain("Congratulations on the consistency and contribution");
    expect(text).toContain("Regards,\nRetention and Renewal Coordinators\nTeam Moneyfestation");
    expect(text).not.toMatch(/Ã|ðŸ|â/);
  });

  it("falls back gracefully when roles, tenure, and history are missing", () => {
    const text = buildMemberAchievementShareText({
      memberName: "Member One",
      roles: [],
      renewalLabel: "Renewal year unavailable",
      tenureLabel: "Tenure not set",
      joiningDateLabel: "Joining date not set",
      achievements: buildMemberAchievements(null, []),
      trafficLightHistory: [],
    });

    expect(text).toContain("🏆 Roles held: No past roles added yet");
    expect(text).toContain("🔄 Renewal year unavailable");
    expect(text).toContain("📅 Member for Tenure not set | Joined Joining date not set");
    expect(text).toContain("✅ Absences: 0");
    expect(text).toContain("📊 Averages:");
    expect(text).toContain("🤝 Referrals / week: -");
    expect(text).toContain("Team Moneyfestation");
    expect(text).not.toContain("Last 6 months:");
  });

  it("uses traffic-light fallback values when PALMS data is unavailable", () => {
    const text = buildMemberAchievementShareText({
      memberName: "Member One",
      roles: [],
      renewalLabel: "Renewing for 2026",
      tenureLabel: "11 months",
      joiningDateLabel: "1 May 2025",
      achievements: buildMemberAchievements(null, trafficLights),
      trafficLightHistory: trafficLights,
    });

    expect(text).toContain("🤝 Referrals given: 8");
    expect(text).toContain("👥 1-to-1s done: -");
    expect(text).toContain("💰 TYFCB: ₹3,000");
    expect(text).toContain("🙌 Visitors: 3");
    expect(text).toContain("📊 Averages:");
    expect(text).not.toContain("Achievements updated till");
  });
});
