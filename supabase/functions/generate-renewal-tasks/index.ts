// Ported from bni-rrc's lib/renewals/tasks.ts (there, called from
// app/api/cron/renewals/route.ts on a bearer-token-guarded cron endpoint —
// see that route for the original scheduling wiring). This is the
// "renewal-task-generation logic, callable manually before anything is
// scheduled" step from docs/BNI_RRC_MIGRATION.md Phase 2 — nothing calls
// this function automatically yet. Wiring an actual schedule (Supabase
// Scheduled Edge Functions or pg_cron) is Phase 4, deliberately deferred:
// it's this project's first scheduled job and needs a monitoring plan first.
//
// Deploy:
//   supabase functions deploy generate-renewal-tasks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateRenewalTasks } from "../_shared/renewals/tasks.ts";
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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const result = await generateRenewalTasks(admin);

    return json(result, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Task generation failed") }, 500);
  }
});
