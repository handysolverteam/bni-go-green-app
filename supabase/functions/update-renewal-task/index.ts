// Ported from bni-rrc's app/api/tasks/[id]/route.ts (PATCH). Next.js's
// dynamic route segment (`[id]`) becomes a JSON body field here instead,
// since Edge Functions don't have path-based routing. See
// import-membership-dues/index.ts for the no-auth-check rationale (same
// pattern here) and docs/BNI_RRC_MIGRATION.md for the plan — this is the
// first Phase 3 write action, wired up after the read-only views.
//
// Body: { id: string, status: "open" | "completed" | "cancelled" }
//
// Deploy:
//   supabase functions deploy update-renewal-task

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCallerScope } from "../_shared/callerScope.ts";
import { getRenewalCycleUpdateForTaskStatus } from "../_shared/renewals/task-status.ts";
import { extractErrorMessage } from "../_shared/renewals/error-message.ts";
import type { RenewalTask } from "../_shared/renewals/types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id) {
      return json({ error: "id is required." }, 400);
    }

    if (!["open", "completed", "cancelled"].includes(status ?? "")) {
      return json({ error: "Invalid task status." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    await logCallerScope(req, admin, "update-renewal-task");
    const table = (name: string) => admin.schema("renewals").from(name);

    const { data: task, error: taskError } = await table("renewal_tasks")
      .select("renewal_cycle_id, task_type")
      .eq("id", id)
      .single();

    if (taskError) {
      return json({ error: taskError.message }, 500);
    }

    const completedAt = new Date();
    const { error } = await table("renewal_tasks")
      .update({
        status,
        completed_at: status === "completed" ? completedAt.toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      return json({ error: error.message }, 500);
    }

    const cycleUpdate = getRenewalCycleUpdateForTaskStatus(
      task.task_type as RenewalTask["task_type"],
      status as RenewalTask["status"],
      completedAt,
    );

    if (cycleUpdate) {
      const { error: cycleError } = await table("renewal_cycles").update(cycleUpdate).eq("id", task.renewal_cycle_id);

      if (cycleError) {
        return json({ error: cycleError.message }, 500);
      }
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Failed to update task.") }, 500);
  }
});
