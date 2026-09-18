import type { RenewalTaskType } from "./types";

export const activeRenewalTaskTypes: RenewalTaskType[] = [
  "mc_discussion",
  "member_discussion",
  "docs_collection",
  "payment_due",
];

export const taskTypeLabels: Record<RenewalTaskType, string> = {
  mc_discussion: "MC Discussion",
  member_discussion: "Member Discussion",
  monthly_review: "Monthly Review",
  renewal_push: "Renewal Push",
  docs_collection: "Documents Sent",
  payment_due: "Payment Completed",
  critical_deadline: "Critical Deadline",
};

export function isActiveRenewalTaskType(taskType: RenewalTaskType): boolean {
  return activeRenewalTaskTypes.includes(taskType);
}
