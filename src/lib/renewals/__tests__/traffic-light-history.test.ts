import { describe, expect, it } from "vitest";
import {
  groupTrafficLightHistoryByMember,
  sortTrafficLightHistoryForDisplay,
} from "../traffic-light-history";
import type { MemberTrafficLight } from "../types";

function trafficLight(
  memberId: string,
  reportMonth: string,
  score: number,
): MemberTrafficLight {
  return {
    id: `${memberId}-${reportMonth}`,
    member_id: memberId,
    report_month: reportMonth,
    report_window_start: null,
    report_window_end: reportMonth,
    score,
    color: score >= 70 ? "green" : score >= 50 ? "yellow" : score >= 30 ? "red" : "grey",
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
    week_count: 0,
    import_batch_id: null,
  };
}

describe("traffic-light history", () => {
  it("keeps the latest six records per member", () => {
    const grouped = groupTrafficLightHistoryByMember([
      trafficLight("member-1", "2026-01-01", 40),
      trafficLight("member-1", "2026-02-01", 45),
      trafficLight("member-1", "2026-03-01", 50),
      trafficLight("member-1", "2026-04-01", 55),
      trafficLight("member-1", "2026-05-01", 60),
      trafficLight("member-1", "2026-06-01", 65),
      trafficLight("member-1", "2026-07-01", 70),
    ]);

    expect(grouped.get("member-1")?.map((item) => item.report_month)).toEqual([
      "2026-07-01",
      "2026-06-01",
      "2026-05-01",
      "2026-04-01",
      "2026-03-01",
      "2026-02-01",
    ]);
  });

  it("groups independent members separately", () => {
    const grouped = groupTrafficLightHistoryByMember([
      trafficLight("member-1", "2026-03-01", 50),
      trafficLight("member-2", "2026-01-01", 70),
    ]);

    expect(grouped.get("member-1")).toHaveLength(1);
    expect(grouped.get("member-2")).toHaveLength(1);
  });

  it("sorts display history chronologically", () => {
    expect(
      sortTrafficLightHistoryForDisplay([
        trafficLight("member-1", "2026-03-01", 50),
        trafficLight("member-1", "2026-01-01", 70),
        trafficLight("member-1", "2026-02-01", 60),
      ]).map((item) => item.report_month),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("can keep all records when no limit is requested", () => {
    const grouped = groupTrafficLightHistoryByMember(
      [
        trafficLight("member-1", "2026-01-01", 40),
        trafficLight("member-1", "2026-02-01", 45),
        trafficLight("member-1", "2026-03-01", 50),
      ],
      null,
    );

    expect(grouped.get("member-1")).toHaveLength(3);
  });
});
