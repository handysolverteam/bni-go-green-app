// Ported from bni-rrc's app/api/import/sponsors/route.ts. See
// import-membership-dues/index.ts for the no-auth-check rationale (same
// pattern here) and docs/BNI_RRC_MIGRATION.md for the overall plan.
//
// Deploy:
//   supabase functions deploy import-sponsors

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importSponsorReport } from "../_shared/renewals/sponsor-database-import.ts";
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
      return json({ error: "Only .xls SpreadsheetML sponsor reports are supported." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const result = await importSponsorReport(admin, await file.text(), file.name);

    return json(result, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Import failed") }, 500);
  }
});
