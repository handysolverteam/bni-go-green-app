// Adapted from bni-rrc's lib/renewals/task-inbox.ts. Business logic
// unchanged; adaptations: explicit `supabase` client param instead of a
// module-level getServiceSupabase() singleton, table qualified into the
// `renewals` schema.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Member, RenewalCycle, RenewalTask } from "./types.ts";
import { isWithinRenewalWorkWindow } from "./stage.ts";
import { getNextInboxTasksByMember, sortInboxTasks, type TaskInboxCandidate, type TaskInboxItem } from "./task-inbox-model.ts";
import { getUrgency } from "./urgency.ts";

type InboxTaskRow = RenewalTask & {
  renewal_cycles: {
    id: string;
    renewal_date: string;
    status: RenewalCycle["status"];
    members: Member | null;
  } | null;
};

export async function getTaskInboxItems(supabase: SupabaseClient, today = new Date()): Promise<TaskInboxItem[]> {
  const { data, error } = await supabase
    .schema("renewals")
    .from("renewal_tasks")
    .select(
      `
      *,
      renewal_cycles!inner (
        id,
        renewal_date,
        status,
        members!inner (*)
      )
    `,
    )
    .eq("status", "open")
    .order("due_date", { ascending: true });

  if (error) {
    throw error;
  }

  return sortInboxTasks(
    getNextInboxTasksByMember(
      ((data ?? []) as InboxTaskRow[])
        .filter(
          (row) =>
            row.renewal_cycles?.members &&
            row.renewal_cycles.status === "active" &&
            isWithinRenewalWorkWindow(row.renewal_cycles.renewal_date, today),
        )
        .map(
          (row): TaskInboxCandidate => ({
            id: row.id,
            renewal_cycle_id: row.renewal_cycle_id,
            task_type: row.task_type,
            due_date: row.due_date,
            status: row.status,
            notes: row.notes,
            completed_at: row.completed_at,
            member: row.renewal_cycles!.members!,
            renewal_date: row.renewal_cycles!.renewal_date,
          }),
        ),
    ).map((task) => ({
      ...task,
      ...getUrgency(task.due_date, today),
    })),
  );
}
