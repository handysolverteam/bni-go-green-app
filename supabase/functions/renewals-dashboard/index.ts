// Ported from bni-rrc's lib/renewals/data.ts. In bni-rrc these four
// functions were called directly from Next.js server components, not
// exposed as separate REST routes — this one Edge Function consolidates
// them behind an `action` query param instead of inventing four routes
// bni-rrc never had. Read-only. See import-membership-dues/index.ts for the
// no-auth-check rationale (same pattern here) and docs/BNI_RRC_MIGRATION.md
// for the plan.
//
// GET ?action=cycles                        -> getDashboardCycles
// GET ?action=achievements                  -> getAchievementMembers
// GET ?action=member-detail&memberId=<uuid> -> getMemberDetail
// GET ?action=committee                     -> getCommitteeMembers
//
// Deploy:
//   supabase functions deploy renewals-dashboard

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCallerScope } from "../_shared/callerScope.ts";
import { getAchievementMembers, getCommitteeMembers, getDashboardCycles, getMemberDetail } from "../_shared/renewals/data.ts";
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

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const admin = createClient(supabaseUrl, serviceRoleKey);
    await logCallerScope(req, admin, "renewals-dashboard", { action });

    switch (action) {
      case "cycles":
        return json(await getDashboardCycles(admin), 200);
      case "achievements":
        return json(await getAchievementMembers(admin), 200);
      case "committee":
        return json(await getCommitteeMembers(admin), 200);
      case "member-detail": {
        const memberId = url.searchParams.get("memberId");
        if (!memberId) {
          return json({ error: "memberId query param is required for action=member-detail." }, 400);
        }
        return json(await getMemberDetail(admin, memberId), 200);
      }
      default:
        return json({ error: "Unknown or missing action. Use cycles, achievements, committee, or member-detail." }, 400);
    }
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Failed to load dashboard data.") }, 500);
  }
});
