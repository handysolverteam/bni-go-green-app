import { describe, expect, it } from "vitest";
import {
  calculateStage,
  getDerivedRenewalDates,
  isWithinRenewalWorkWindow,
} from "../stage";
import type { RenewalTask, RenewalTaskType } from "../types";

const baseCycle = {
  renewal_date: "2026-07-01",
  status: "active" as const,
};

function utc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function task(
  taskType: RenewalTaskType,
  status: RenewalTask["status"] = "completed",
): RenewalTask {
  return {
    id: taskType,
    renewal_cycle_id: "cycle-1",
    task_type: taskType,
    due_date: "2026-04-01",
    status,
    notes: null,
    completed_at: status === "completed" ? "2026-04-01T00:00:00.000Z" : null,
  };
}

describe("calculateStage", () => {
  it("returns status stages first", () => {
    expect(calculateStage({ ...baseCycle, status: "renewed" }, utc("2025-01-01"))).toBe("Renewed");
    expect(calculateStage({ ...baseCycle, status: "dropped" }, utc("2025-01-01"))).toBe("Dropped");
  });

  it("uses the first incomplete required task as the active stage", () => {
    expect(calculateStage({ ...baseCycle, renewal_tasks: [] }, utc("2026-03-03"))).toBe("MC Discussion");
    expect(
      calculateStage({ ...baseCycle, renewal_tasks: [task("mc_discussion")] }, utc("2026-03-03")),
    ).toBe("Member Discussion");
    expect(
      calculateStage(
        {
          ...baseCycle,
          renewal_tasks: [task("mc_discussion"), task("member_discussion")],
        },
        utc("2026-03-03"),
      ),
    ).toBe("Documents Pending");
    expect(
      calculateStage(
        {
          ...baseCycle,
          renewal_tasks: [
            task("mc_discussion"),
            task("member_discussion"),
            task("docs_collection"),
          ],
        },
        utc("2026-03-03"),
      ),
    ).toBe("Payment Pending");
  });

  it("keeps active cycles in payment pending when all required tasks are complete", () => {
    expect(
      calculateStage(
        {
          ...baseCycle,
          renewal_tasks: [
            task("mc_discussion"),
            task("member_discussion"),
            task("docs_collection"),
            task("payment_due"),
          ],
        },
        utc("2026-03-03"),
      ),
    ).toBe("Payment Pending");
  });

  it("does not advance stages for cancelled required tasks", () => {
    expect(
      calculateStage(
        {
          ...baseCycle,
          renewal_tasks: [task("mc_discussion"), task("member_discussion", "cancelled")],
        },
        utc("2026-03-03"),
      ),
    ).toBe("Member Discussion");
  });

  it("keeps active cycles out of workflow before 120 days", () => {
    expect(calculateStage({ ...baseCycle, renewal_tasks: [] }, utc("2026-03-02"))).toBeNull();
  });

  it("keeps critical deadline as an active-cycle deadline override", () => {
    expect(calculateStage({ ...baseCycle, renewal_tasks: [] }, utc("2026-06-15"))).toBe(
      "Critical Deadline",
    );
  });

  it("calculates final deadline across year boundaries", () => {
    expect(getDerivedRenewalDates("2027-01-01").final_deadline).toBe("2026-12-15");
  });

  it("calculates active workflow dates", () => {
    expect(getDerivedRenewalDates("2026-06-01")).toMatchObject({
      mc_discussion_date: "2026-02-01",
      member_discussion_date: "2026-04-02",
      documents_sent_date: "2026-04-17",
      payment_due_date: "2026-05-02",
      final_deadline: "2026-05-15",
    });
  });

  it("identifies the 120-day renewal work window", () => {
    expect(isWithinRenewalWorkWindow("2026-07-01", utc("2026-03-02"))).toBe(false);
    expect(isWithinRenewalWorkWindow("2026-07-01", utc("2026-03-03"))).toBe(true);
  });
});
