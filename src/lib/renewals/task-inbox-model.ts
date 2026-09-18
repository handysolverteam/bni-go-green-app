import type { Member, RenewalTask } from "./types";
import { activeRenewalTaskTypes } from "./task-types";
import type { Urgency, UrgencyLabel } from "./urgency";

export type TaskInboxCandidate = RenewalTask & {
    member: Member;
    renewal_date: string;
  };

export type TaskInboxItem = TaskInboxCandidate & Urgency;

export type TaskInboxGroups = Record<UrgencyLabel, TaskInboxItem[]>;

export function getNextWorkflowTask<T extends Pick<RenewalTask, "task_type" | "status">>(
  tasks: T[],
): T | null {
  return (
    activeRenewalTaskTypes
      .map((taskType) =>
        tasks.find((task) => task.task_type === taskType && task.status === "open"),
      )
      .find((task): task is T => Boolean(task)) ?? null
  );
}

export function groupInboxTasks(tasks: TaskInboxItem[]): TaskInboxGroups {
  return {
    overdue: tasks.filter((task) => task.urgency_label === "overdue"),
    due_soon: tasks.filter((task) => task.urgency_label === "due_soon"),
    upcoming: tasks.filter((task) => task.urgency_label === "upcoming"),
  };
}

export function sortInboxTasks(tasks: TaskInboxItem[]): TaskInboxItem[] {
  return [...tasks].sort(
    (first, second) =>
      second.urgency_score - first.urgency_score ||
      first.due_date.localeCompare(second.due_date),
  );
}

export function getNextInboxTasksByMember<T extends TaskInboxCandidate>(tasks: T[]): T[] {
  const tasksByMember = new Map<string, T[]>();

  for (const task of tasks) {
    const memberTasks = tasksByMember.get(task.member.id) ?? [];
    memberTasks.push(task);
    tasksByMember.set(task.member.id, memberTasks);
  }

  return Array.from(tasksByMember.values()).flatMap((memberTasks) => {
    const earliestRenewalDate = memberTasks
      .map((task) => task.renewal_date)
      .sort((first, second) => first.localeCompare(second))[0];
    const currentCycleTasks = memberTasks.filter(
      (task) => task.renewal_date === earliestRenewalDate,
    );
    const nextTask = getNextWorkflowTask(currentCycleTasks);

    return nextTask ? [nextTask] : [];
  });
}
