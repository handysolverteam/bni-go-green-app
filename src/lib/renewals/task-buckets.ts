import type { DashboardCycle, RenewalTask } from "./types";
import { isWithinRenewalWorkWindow } from "./stage";
import { isActiveRenewalTaskType } from "./task-types";

export type DashboardTaskBucketKey = "pastDue" | "thisWeek" | "nextWeek";

export type DashboardTaskItem = RenewalTask & {
  member: DashboardCycle["member"];
  renewal_date: DashboardCycle["renewal_date"];
  stage: DashboardCycle["stage"];
};

export type DashboardTaskBuckets = Record<DashboardTaskBucketKey, DashboardTaskItem[]>;

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
  return weekStart;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getDashboardTaskBuckets(
  cycles: DashboardCycle[],
  today = new Date(),
): DashboardTaskBuckets {
  const thisWeekStart = startOfUtcWeek(today);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const weekAfterNextStart = addDays(thisWeekStart, 14);

  const buckets: DashboardTaskBuckets = {
    pastDue: [],
    thisWeek: [],
    nextWeek: [],
  };

  for (const cycle of cycles) {
    if (!isWithinRenewalWorkWindow(cycle.renewal_date, today)) {
      continue;
    }

    for (const task of cycle.renewal_tasks) {
      if (task.status !== "open" || !isActiveRenewalTaskType(task.task_type)) {
        continue;
      }

      const dueDate = parseDateOnly(task.due_date);
      const taskItem: DashboardTaskItem = {
        ...task,
        member: cycle.member,
        renewal_date: cycle.renewal_date,
        stage: cycle.stage,
      };

      if (dueDate < thisWeekStart) {
        buckets.pastDue.push(taskItem);
      } else if (dueDate < nextWeekStart) {
        buckets.thisWeek.push(taskItem);
      } else if (dueDate < weekAfterNextStart) {
        buckets.nextWeek.push(taskItem);
      }
    }
  }

  for (const key of Object.keys(buckets) as DashboardTaskBucketKey[]) {
    buckets[key].sort((first, second) => first.due_date.localeCompare(second.due_date));
  }

  return buckets;
}
