// Ported as-is from bni-rrc: a stub there too, never wired to a real
// notification channel. Kept for generate-renewal-tasks, which calls this on
// task-creation — replace with a real implementation (or a call into
// Handychapter's own WhatsApp outreach system) before relying on it.

import type { RenewalTaskType } from "./types.ts";

export async function sendNotification(renewalCycle: { id: string; member_id: string }, type: RenewalTaskType) {
  console.log("[notification:stub]", {
    renewalCycleId: renewalCycle.id,
    memberId: renewalCycle.member_id,
    type,
  });
}
