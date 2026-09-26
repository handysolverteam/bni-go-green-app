// Ported from bni-rrc's app/api/import/membership-dues/route.ts, which called
// importMembershipDuesReport() directly against the service-role key with no
// auth at all (bni-rrc has none). This Edge Function matches that: no caller
// auth check. Handychapter's client never establishes a Supabase Auth session
// for Firebase-authenticated users (confirmed while building Phase 3 — see
// docs/BNI_RRC_MIGRATION.md), so a Supabase-JWT gate here would reject nearly
// every real user, not just unauthorized ones. This matches the same
// anon-key-plus-permissive-RLS posture the rest of Handychapter already runs
// under (see docs/SECURITY_REMEDIATION.md) rather than inventing a stricter
// rule only this feature would enforce. Real authorization (e.g. restricting
// this to committee/owner roles) is an open decision left to Phase 4 — not
// invented here.
//
// Deploy:
//   supabase functions deploy import-membership-dues

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCallerScope } from "../_shared/callerScope.ts";
import { importMembershipDuesReport } from "../_shared/renewals/database-import.ts";
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

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return json({ error: "A .xls file is required." }, 400);
    }

    if (!file.name.toLowerCase().endsWith(".xls")) {
      return json({ error: "Only .xls SpreadsheetML reports are supported." }, 400);
    }

    const xml = await file.text();
    const admin = createClient(supabaseUrl, serviceRoleKey);
    await logCallerScope(req, admin, "import-membership-dues");
    const result = await importMembershipDuesReport(admin, xml, file.name);

    return json(result, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Import failed") }, 500);
  }
});
