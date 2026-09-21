import { describe, expect, it } from "vitest";
import { getDefaultMobileStage, groupCyclesByStage } from "../stage-groups";
import type { DashboardCycle } from "../types";

function cycle(stage: DashboardCycle["stage"]): DashboardCycle {
  return {
    id: `cycle-${stage}`,
    member_id: `member-${stage}`,
    renewal_year: 2026,
    renewal_date: "2026-07-01",
    reported_due_date: null,
    status: "active",
    source_membership_status: "Active",
    auto_renewal_enabled: false,
    is_two_year_renewal: false,
    last_followup_date: null,
    next_followup_date: null,
    online_form_filled: false,
    online_form_filled_date: null,
    checklist_filled: false,
    checklist_filled_date: null,
    payment_link_generated: false,
    payment_link_generated_date: null,
    payment_made: false,
    payment_made_date: null,
    member: {
      id: `member-${stage}`,
      auth_user_id: null,
      name: "Member",
      industry: "Industry",
      sponsor: null,
      report_role: null,
      member_since: null,
      is_committee: false,
    },
    latest_traffic_light: null,
    traffic_light_history: [],
    stage,
    derived_dates: {
      mc_discussion_date: "2026-04-02",
      member_discussion_date: "2026-05-02",
      documents_sent_date: "2026-05-17",
      payment_due_date: "2026-06-01",
      final_deadline: "2026-06-15",
    },
    assignments: [],
    renewal_tasks: [],
    open_task_count: 0,
  };
}

describe("stage groups", () => {
  it("selects the first stage with cycles as the default mobile stage", () => {
    expect(getDefaultMobileStage([cycle("Payment Pending"), cycle("Documents Pending")])).toBe(
      "Documents Pending",
    );
  });

  it("falls back to MC Discussion when there are no active cycles", () => {
    expect(getDefaultMobileStage([])).toBe("MC Discussion");
  });

  it("groups cycles by every known stage", () => {
    const groups = groupCyclesByStage([cycle("Critical Deadline")]);

    expect(groups).toHaveLength(7);
    expect(groups.find((group) => group.stage === "Critical Deadline")?.cycles).toHaveLength(1);
  });

  it("does not group renewals that have not started the active workflow", () => {
    const groups = groupCyclesByStage([cycle(null)]);

    expect(groups.every((group) => group.cycles.length === 0)).toBe(true);
  });
});
