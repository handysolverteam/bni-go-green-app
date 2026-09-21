import { describe, expect, it } from "vitest";
import { getDashboardTaskBuckets } from "../task-buckets";
import type { DashboardCycle, RenewalTask } from "../types";

function task(
  id: string,
  dueDate: string,
  status: RenewalTask["status"] = "open",
): RenewalTask {
  return {
    id,
    renewal_cycle_id: "cycle-1",
    task_type: "mc_discussion",
    due_date: dueDate,
    status,
    notes: null,
    completed_at: null,
  };
}

function cycle(tasks: RenewalTask[]): DashboardCycle {
  return {
    id: "cycle-1",
    member_id: "member-1",
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
      id: "member-1",
      auth_user_id: null,
      name: "Member One",
      industry: "Industry",
      sponsor: null,
      report_role: null,
      member_since: null,
      is_committee: false,
    },
    latest_traffic_light: null,
    traffic_light_history: [],
    stage: "Member Discussion",
    derived_dates: {
      mc_discussion_date: "2026-03-03",
      member_discussion_date: "2026-05-02",
      documents_sent_date: "2026-05-17",
      payment_due_date: "2026-06-01",
      final_deadline: "2026-06-15",
    },
    assignments: [],
    renewal_tasks: tasks,
    open_task_count: tasks.filter((item) => item.status === "open").length,
  };
}

describe("dashboard task buckets", () => {
  const today = new Date("2026-04-14T00:00:00.000Z");

  it("groups open tasks into past due, this week, and next week", () => {
    const buckets = getDashboardTaskBuckets(
      [
        cycle([
          task("past", "2026-04-12"),
          task("this-week", "2026-04-15"),
          task("next-week", "2026-04-20"),
          task("future", "2026-04-27"),
        ]),
      ],
      today,
    );

    expect(buckets.pastDue.map((item) => item.id)).toEqual(["past"]);
    expect(buckets.thisWeek.map((item) => item.id)).toEqual(["this-week"]);
    expect(buckets.nextWeek.map((item) => item.id)).toEqual(["next-week"]);
  });

  it("excludes completed and cancelled tasks", () => {
    const buckets = getDashboardTaskBuckets(
      [
        cycle([
          task("completed", "2026-04-15", "completed"),
          task("cancelled", "2026-04-20", "cancelled"),
        ]),
      ],
      today,
    );

    expect(buckets.pastDue).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.nextWeek).toEqual([]);
  });

  it("excludes legacy workflow task types", () => {
    const buckets = getDashboardTaskBuckets(
      [
        cycle([
          { ...task("monthly", "2026-04-15"), task_type: "monthly_review" },
          { ...task("push", "2026-04-20"), task_type: "renewal_push" },
          { ...task("critical", "2026-04-20"), task_type: "critical_deadline" },
        ]),
      ],
      today,
    );

    expect(buckets.pastDue).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.nextWeek).toEqual([]);
  });

  it("sorts tasks in each bucket by due date", () => {
    const buckets = getDashboardTaskBuckets(
      [cycle([task("second", "2026-04-16"), task("first", "2026-04-14")])],
      today,
    );

    expect(buckets.thisWeek.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("excludes tasks for cycles outside the 120-day renewal work window", () => {
    const buckets = getDashboardTaskBuckets(
      [{ ...cycle([task("future-cycle", "2026-04-15")]), renewal_date: "2026-09-01" }],
      today,
    );

    expect(buckets.pastDue).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.nextWeek).toEqual([]);
  });
});
