import type { DerivedRenewalDates, RenewalCycle, RenewalStage, RenewalTask } from "./types";

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getDerivedRenewalDates(renewalDate: string): DerivedRenewalDates {
  const renewal = parseDateOnly(renewalDate);
  const finalDeadline = new Date(
    Date.UTC(renewal.getUTCFullYear(), renewal.getUTCMonth() - 1, 15),
  );

  return {
    mc_discussion_date: toDateOnly(addDays(renewal, -120)),
    member_discussion_date: toDateOnly(addDays(renewal, -60)),
    documents_sent_date: toDateOnly(addDays(renewal, -45)),
    payment_due_date: toDateOnly(addDays(renewal, -30)),
    final_deadline: toDateOnly(finalDeadline),
  };
}

export function calculateStage(
  renewalCycle: Pick<RenewalCycle, "renewal_date" | "status"> & {
    renewal_tasks?: Pick<RenewalTask, "task_type" | "status">[];
  },
  today = new Date(),
): RenewalStage | null {
  if (renewalCycle.status === "renewed") {
    return "Renewed";
  }

  if (renewalCycle.status === "dropped") {
    return "Dropped";
  }

  if (!isWithinRenewalWorkWindow(renewalCycle.renewal_date, today)) {
    return null;
  }

  const todayOnly = toDateOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );
  const derived = getDerivedRenewalDates(renewalCycle.renewal_date);

  if (todayOnly >= derived.final_deadline) {
    return "Critical Deadline";
  }

  const tasks = renewalCycle.renewal_tasks ?? [];

  if (!isTaskCompleted(tasks, "mc_discussion")) {
    return "MC Discussion";
  }

  if (!isTaskCompleted(tasks, "member_discussion")) {
    return "Member Discussion";
  }

  if (!isTaskCompleted(tasks, "docs_collection")) {
    return "Documents Pending";
  }

  return "Payment Pending";
}

function isTaskCompleted(
  tasks: Pick<RenewalTask, "task_type" | "status">[],
  taskType: RenewalTask["task_type"],
): boolean {
  return tasks.some((task) => task.task_type === taskType && task.status === "completed");
}

export function isWithinRenewalWorkWindow(renewalDate: string, today = new Date()): boolean {
  const todayOnly = toDateOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  );
  return todayOnly >= getDerivedRenewalDates(renewalDate).mc_discussion_date;
}

export const renewalStages: RenewalStage[] = [
  "MC Discussion",
  "Member Discussion",
  "Documents Pending",
  "Payment Pending",
  "Critical Deadline",
  "Renewed",
  "Dropped",
];
