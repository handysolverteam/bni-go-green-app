// Ported from bni-rrc's app/api/import/palms/route.ts. See
// import-membership-dues/index.ts for the no-auth-check rationale (same
// pattern here) and docs/BNI_RRC_MIGRATION.md for the overall plan.
//
// Deploy:
//   supabase functions deploy import-palms

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPalmsChapterSummaryReports } from "../_shared/renewals/palms-database-import.ts";
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
    const files = [...formData.getAll("files"), ...formData.getAll("file")].filter(
      (value): value is File => value instanceof File,
    );

    if (files.length === 0) {
      return json({ error: "At least one .xls file is required." }, 400);
    }

    const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith(".xls"));
    if (invalidFile) {
      return json(
        { error: `Only .xls SpreadsheetML PALMS reports are supported. Invalid file: ${invalidFile.name}` },
        400,
      );
    }

    const payload = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        xml: await file.text(),
      })),
    );

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const result = await importPalmsChapterSummaryReports(admin, payload);

    return json(result, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Import failed") }, 500);
  }
});
