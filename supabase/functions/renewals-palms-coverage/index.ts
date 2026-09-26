// Ported from bni-rrc's lib/renewals/import-coverage.ts (there it was called
// directly from a server component, not exposed as its own API route — this
// is the first Edge Function in this batch with no 1:1 bni-rrc route to
// mirror). Read-only: reports which PALMS months have been imported and
// which are missing. See import-membership-dues/index.ts for the
// no-auth-check rationale (same pattern here) and docs/BNI_RRC_MIGRATION.md
// for the plan.
//
// Deploy:
//   supabase functions deploy renewals-palms-coverage

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCallerScope } from "../_shared/callerScope.ts";
import { getPalmsMonthlyCoverage } from "../_shared/renewals/import-coverage.ts";
import { extractErrorMessage } from "../_shared/renewals/error-message.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  if (req.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    await logCallerScope(req, admin, "renewals-palms-coverage");
    const result = await getPalmsMonthlyCoverage(admin);

    return json(result, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Failed to load coverage.") }, 500);
  }
});
