// Direct port of bni-rrc's lib/renewals/task-status.ts (also ported for the
// client bundle at src/lib/renewals/task-status.ts). Pure, Deno-compatible.

import type { RenewalTask, RenewalTaskType } from "./types.ts";

export type RenewalCycleTaskCompletionUpdate = {
  status: "renewed";
  payment_made: true;
  payment_made_date: string;
};

export function getRenewalCycleUpdateForTaskStatus(
  taskType: RenewalTaskType,
  status: RenewalTask["status"],
  completedAt: Date,
): RenewalCycleTaskCompletionUpdate | null {
  if (taskType !== "payment_due" || status !== "completed") {
    return null;
  }

  return {
    status: "renewed",
    payment_made: true,
    payment_made_date: completedAt.toISOString().slice(0, 10),
  };
}
