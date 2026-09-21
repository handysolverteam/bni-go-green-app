import { describe, expect, it } from "vitest";
import { getRenewalCycleUpdateForTaskStatus } from "../task-status";

describe("task status side effects", () => {
  const completedAt = new Date("2026-04-19T12:00:00.000Z");

  it("marks the renewal cycle renewed when payment is completed", () => {
    expect(getRenewalCycleUpdateForTaskStatus("payment_due", "completed", completedAt)).toEqual({
      status: "renewed",
      payment_made: true,
      payment_made_date: "2026-04-19",
    });
  });

  it("does not renew the cycle for non-payment tasks", () => {
    expect(getRenewalCycleUpdateForTaskStatus("docs_collection", "completed", completedAt)).toBeNull();
  });

  it("does not renew the cycle when payment is cancelled or reopened", () => {
    expect(getRenewalCycleUpdateForTaskStatus("payment_due", "cancelled", completedAt)).toBeNull();
    expect(getRenewalCycleUpdateForTaskStatus("payment_due", "open", completedAt)).toBeNull();
  });
});
