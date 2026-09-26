// Ported from bni-rrc's app/api/renewal-cycles/[id]/route.ts (PATCH).
// Next.js's dynamic route segment (`[id]`) becomes a JSON body field here
// instead, since Edge Functions don't have path-based routing. See
// import-membership-dues/index.ts for the no-auth-check rationale (same
// pattern here) and docs/BNI_RRC_MIGRATION.md for the plan.
//
// Body: { id: string, status?, last_followup_date?, next_followup_date?,
//          online_form_filled?, checklist_filled?, payment_link_generated?,
//          payment_made?, assignments?: [{ slot: 1|2, assignee_member_id }] }
//
// NOTE: the current Renewals UI (RenewalMemberDetailModal) only calls this
// with `status` so far — the checklist/assignment fields are ported here
// faithfully (cheap, since buildChecklistUpdates() already existed from the
// Phase 1 port) but have no UI wired to them yet.
//
// Deploy:
//   supabase functions deploy update-renewal-cycle

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCallerScope } from "../_shared/callerScope.ts";
import { buildChecklistUpdates } from "../_shared/renewals/checklist.ts";
import { extractErrorMessage } from "../_shared/renewals/error-message.ts";

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

const editableFields = ["status", "last_followup_date", "next_followup_date"] as const;
const validStatuses = ["active", "renewed", "dropped"];

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

    const body = (await req.json()) as Record<string, unknown> & { id?: string };
    const { id } = body;

    if (!id) {
      return json({ error: "id is required." }, 400);
    }

    if (typeof body.status === "string" && !validStatuses.includes(body.status)) {
      return json({ error: "Invalid cycle status." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    await logCallerScope(req, admin, "update-renewal-cycle");
    const table = (name: string) => admin.schema("renewals").from(name);

    const updates: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    Object.assign(updates, buildChecklistUpdates(body));

    if (Object.keys(updates).length > 0) {
      const { error } = await table("renewal_cycles").update(updates).eq("id", id);

      if (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (Array.isArray(body.assignments)) {
      for (const assignment of body.assignments as Array<{ slot?: number; assignee_member_id?: string | null }>) {
        if (![1, 2].includes(assignment.slot as number)) {
          continue;
        }

        if (assignment.assignee_member_id) {
          const { error } = await table("renewal_assignments").upsert(
            {
              renewal_cycle_id: id,
              slot: assignment.slot,
              assignee_member_id: assignment.assignee_member_id,
            },
            { onConflict: "renewal_cycle_id,slot" },
          );

          if (error) {
            return json({ error: error.message }, 500);
          }
        } else {
          const { error } = await table("renewal_assignments")
            .delete()
            .eq("renewal_cycle_id", id)
            .eq("slot", assignment.slot);

          if (error) {
            return json({ error: error.message }, 500);
          }
        }
      }
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Failed to update renewal cycle.") }, 500);
  }
});
