import { describe, expect, it } from "vitest";
import {
  getNextInboxTasksByMember,
  getNextWorkflowTask,
  sortInboxTasks,
  type TaskInboxItem,
} from "../task-inbox-model";
import { getUrgency } from "../urgency";
import type { Member, RenewalTask, RenewalTaskType } from "../types";

const member: Member = {
  id: "member-1",
  auth_user_id: null,
  name: "Member One",
  industry: "Industry",
  sponsor: null,
  report_role: null,
  member_since: null,
  is_committee: false,
};

function inboxTask(
  id: string,
  dueDate: string,
  score: 100 | 70 | 30,
  overrides: Partial<TaskInboxItem> = {},
): TaskInboxItem {
  return {
    id,
    renewal_cycle_id: "cycle-1",
    task_type: "mc_discussion",
    due_date: dueDate,
    status: "open",
    notes: null,
    completed_at: null,
    member,
    renewal_date: "2026-07-01",
    urgency_score: score,
    urgency_label: score === 100 ? "overdue" : score === 70 ? "due_soon" : "upcoming",
    color: score === 100 ? "red" : score === 70 ? "yellow" : "green",
    ...overrides,
  };
}

function openTask(
  id: string,
  taskType: RenewalTaskType,
  memberId = "member-1",
  renewalDate = "2026-07-01",
  status: RenewalTask["status"] = "open",
): TaskInboxItem {
  return inboxTask(id, "2026-04-19", 70, {
    task_type: taskType,
    status,
    member: { ...member, id: memberId, name: `Member ${memberId}` },
    renewal_cycle_id: `${memberId}-${renewalDate}`,
    renewal_date: renewalDate,
  });
}

describe("renewal task urgency", () => {
  const today = new Date("2026-04-19T00:00:00.000Z");

  it("marks dates before today as overdue", () => {
    expect(getUrgency("2026-04-18", today)).toEqual({
      urgency_score: 100,
      urgency_label: "overdue",
      color: "red",
    });
  });

  it("marks dates through the next ten days as due soon", () => {
    expect(getUrgency("2026-04-29", today)).toEqual({
      urgency_score: 70,
      urgency_label: "due_soon",
      color: "yellow",
    });
  });

  it("marks dates more than ten days away as upcoming", () => {
    expect(getUrgency("2026-04-30", today)).toEqual({
      urgency_score: 30,
      urgency_label: "upcoming",
      color: "green",
    });
  });

  it("sorts by highest urgency, then earliest due date", () => {
    const sorted = sortInboxTasks([
      inboxTask("upcoming", "2026-04-20", 30),
      inboxTask("overdue-later", "2026-04-18", 100),
      inboxTask("overdue-earlier", "2026-04-17", 100),
      inboxTask("due-soon", "2026-04-19", 70),
    ]);

    expect(sorted.map((task) => task.id)).toEqual([
      "overdue-earlier",
      "overdue-later",
      "due-soon",
      "upcoming",
    ]);
  });

  it("selects only the first open workflow task for each member", () => {
    const selected = getNextInboxTasksByMember([
      openTask("docs", "docs_collection"),
      openTask("mc", "mc_discussion"),
      openTask("member", "member_discussion"),
    ]);

    expect(selected.map((task) => task.id)).toEqual(["mc"]);
  });

  it("chooses the first open workflow task for one cycle", () => {
    const nextTask = getNextWorkflowTask([
      openTask("payment", "payment_due"),
      openTask("member", "member_discussion"),
      openTask("mc", "mc_discussion"),
    ]);

    expect(nextTask?.id).toBe("mc");
  });

  it("chooses member discussion when mc discussion is not open", () => {
    const nextTask = getNextWorkflowTask([
      openTask("mc", "mc_discussion", "member-1", "2026-07-01", "completed"),
      openTask("member", "member_discussion"),
      openTask("docs", "docs_collection"),
    ]);

    expect(nextTask?.id).toBe("member");
  });

  it("ignores completed and cancelled workflow tasks", () => {
    const nextTask = getNextWorkflowTask([
      openTask("mc", "mc_discussion", "member-1", "2026-07-01", "completed"),
      openTask("member", "member_discussion", "member-1", "2026-07-01", "cancelled"),
      openTask("docs", "docs_collection"),
    ]);

    expect(nextTask?.id).toBe("docs");
  });

  it("returns null when no workflow task is open", () => {
    const nextTask = getNextWorkflowTask([
      openTask("mc", "mc_discussion", "member-1", "2026-07-01", "completed"),
      openTask("member", "member_discussion", "member-1", "2026-07-01", "cancelled"),
    ]);

    expect(nextTask).toBeNull();
  });

  it("keeps one next task for each member", () => {
    const selected = getNextInboxTasksByMember([
      openTask("member-1-mc", "mc_discussion", "member-1"),
      openTask("member-1-payment", "payment_due", "member-1"),
      openTask("member-2-docs", "docs_collection", "member-2"),
    ]);

    expect(selected.map((task) => task.id).sort()).toEqual(["member-1-mc", "member-2-docs"]);
  });

  it("shows the next workflow task when earlier tasks are already absent from open tasks", () => {
    const selected = getNextInboxTasksByMember([
      openTask("docs", "docs_collection"),
      openTask("payment", "payment_due"),
    ]);

    expect(selected.map((task) => task.id)).toEqual(["docs"]);
  });

  it("uses the earliest renewal cycle when a member has multiple active cycles", () => {
    const selected = getNextInboxTasksByMember([
      openTask("later-mc", "mc_discussion", "member-1", "2026-09-01"),
      openTask("earlier-payment", "payment_due", "member-1", "2026-07-01"),
    ]);

    expect(selected.map((task) => task.id)).toEqual(["earlier-payment"]);
  });
});
