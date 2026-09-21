import type { RenewalTaskType } from "./types";

// Ported as-is from bni-rrc: a stub, never wired to a real notification
// channel there either. Kept for the Phase 2 port of tasks.ts, which calls
// this on task-completion side effects — replace with a real implementation
// (or Handychapter's own toast/notification system) before relying on it.
export async function sendNotification(
  renewalCycle: { id: string; member_id: string },
  type: RenewalTaskType,
) {
  console.log("[notification:stub]", {
    renewalCycleId: renewalCycle.id,
    memberId: renewalCycle.member_id,
    type,
  });
}
