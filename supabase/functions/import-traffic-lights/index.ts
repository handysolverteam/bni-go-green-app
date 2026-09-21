// Ported from bni-rrc's app/api/import/traffic-lights/route.ts. That route's
// extractPdfText() configured pdf-parse's worker via a physical
// node_modules/pdfjs-dist file path (Node-only, `process.cwd()` +
// `pathToFileURL`) — that specific approach does not translate to a
// Supabase Edge Function's Deno sandbox (no such file layout at runtime).
// Verified as a real (not assumed) alternative: `npm:pdf-parse@2.4.5`
// resolves and extracts text under Deno with NO worker configuration at
// all — confirmed with a local smoke test against both a minimal synthetic
// PDF and an invalid buffer (see docs/BNI_RRC_MIGRATION.md Phase 2 notes).
// `npm:xlsx@0.18.5` was verified the same way for the XLSX branch. See
// import-membership-dues/index.ts for the no-auth-check rationale (same
// pattern here).
//
// Deploy:
//   supabase functions deploy import-traffic-lights
//
// NOTE: unlike the other 9 ported functions, this one's PDF/XLSX-parsing
// path has only been smoke-tested against synthetic files in this session,
// not against a real BNI traffic-lights PDF/XLSX export or a deployed
// function — verify with a real report before trusting it in production.

import { Buffer } from "node:buffer";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFParse } from "npm:pdf-parse@2.4.5";
import {
  formatImportError,
  importTrafficLightPdfScoreReport,
  importTrafficLightReport,
  importTrafficLightXlsxReport,
} from "../_shared/renewals/traffic-light-import.ts";

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

async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

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
    const reportMonth = formData.get("reportMonth");

    if (!(file instanceof File)) {
      return json({ error: "A .pdf or .xlsx file is required." }, 400);
    }

    const filename = file.name.toLowerCase();

    if (!filename.endsWith(".pdf") && !filename.endsWith(".xlsx")) {
      return json({ error: "Only PDF or XLSX traffic-light reports are supported." }, 400);
    }

    const normalizedReportMonth = typeof reportMonth === "string" && reportMonth ? reportMonth : null;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (filename.endsWith(".xlsx")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await importTrafficLightXlsxReport(admin, buffer, file.name, normalizedReportMonth);
      return json(result, 200);
    }

    const text = await extractPdfText(file);
    const result = text.includes("Chapter Name Total Score")
      ? await importTrafficLightPdfScoreReport(admin, text, file.name, normalizedReportMonth)
      : await importTrafficLightReport(admin, text, file.name, normalizedReportMonth);

    return json(result, 200);
  } catch (err) {
    return json({ error: formatImportError(err) }, 500);
  }
});
