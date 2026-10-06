// RBAC Phase 3: grants or revokes a committee tag (go_green / rrc) for a member of an org.
// Unlike the log-only Renewals functions, this ENFORCES from day one -- it hands out
// privileges, so only an Admin/Superadmin of that org may call it.
//
// Granting `rrc` also links the member to their renewals.members row (sets firebase_uid and
// is_committee) so Renewals can recognise them. The row is matched by exact name or a known
// alias only, never created: a near-miss name would otherwise spawn a duplicate member and
// split their renewal history. Unmatched/ambiguous links are reported back for manual fixing.
//
// Body: { orgId: string, userId: string, committee: "go_green" | "rrc", grant: boolean }
//
// Deploy: supabase functions deploy sync-committee-tag   (verify_jwt = false in config.toml:
// the bearer is a Firebase ID token, verified below.)

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseIdToken, getFirebaseUserClaims, setFirebaseUserClaims } from "../_shared/firebaseAdmin.ts";
import { buildMemberNameResolver, loadMemberAliases } from "../_shared/renewals/member-aliases.ts";
import { extractErrorMessage } from "../_shared/renewals/error-message.ts";

/**
 * "rrc" and "slips" each additionally gate access to an external app (bni-rrc / bni-rrc-slips)
 * that has no access to this Supabase project, so the grant/revoke is mirrored into a Firebase
 * custom claim of the same name -- those apps check it straight from the ID token instead of
 * needing a cross-database query. "go_green" has no such external app and is left alone.
 */
const APP_ACCESS_COMMITTEES = new Set(["rrc", "slips"]);

async function syncAppAccessClaim(userId: string, committee: string, grant: boolean) {
  if (!APP_ACCESS_COMMITTEES.has(committee)) return;
  const claims = await getFirebaseUserClaims(userId);
  await setFirebaseUserClaims(userId, { ...claims, [committee]: grant });
}

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

const COMMITTEES = ["go_green", "rrc", "slips"] as const;
type Committee = (typeof COMMITTEES)[number];

type RenewalsLink = "linked" | "already_linked" | "unmatched" | "ambiguous" | "conflict" | "unlinked" | "not_applicable";

async function linkRenewalsMember(admin: SupabaseClient, userId: string): Promise<RenewalsLink> {
  const members = admin.schema("renewals").from("members");

  const { data: existing, error: existingError } = await members.select("id").eq("firebase_uid", userId).limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    const { error } = await members.update({ is_committee: true }).eq("firebase_uid", userId);
    if (error) throw error;
    return "already_linked";
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const fullName = (profile?.full_name as string | null)?.trim();
  if (!fullName) return "unmatched";

  const [{ data: roster, error: rosterError }, aliases] = await Promise.all([
    members.select("id, name, firebase_uid"),
    loadMemberAliases(admin),
  ]);
  if (rosterError) throw rosterError;

  const matches = buildMemberNameResolver(
    (roster ?? []) as Array<{ id: string; name: string; firebase_uid: string | null }>,
    aliases,
  )(fullName);

  if (matches.length === 0) return "unmatched";
  if (matches.length > 1) return "ambiguous";
  if (matches[0].firebase_uid && matches[0].firebase_uid !== userId) return "conflict";

  const { error } = await members.update({ firebase_uid: userId, is_committee: true }).eq("id", matches[0].id);
  if (error) throw error;
  return "linked";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!idToken) {
    return json({ error: "Sign in required." }, 401);
  }

  let callerUid: string;
  try {
    ({ uid: callerUid } = await verifyFirebaseIdToken(idToken));
  } catch {
    return json({ error: "Sign in required." }, 401);
  }

  try {
    const { orgId, userId, committee, grant } = (await req.json()) as {
      orgId?: string;
      userId?: string;
      committee?: string;
      grant?: boolean;
    };

    if (!orgId || !userId || typeof grant !== "boolean") {
      return json({ error: "orgId, userId and grant are required." }, 400);
    }
    if (!COMMITTEES.includes(committee as Committee)) {
      return json({ error: "committee must be go_green, rrc or slips." }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerRow, error: callerError } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", callerUid)
      .maybeSingle();
    if (callerError) throw callerError;
    if (callerRow?.role !== "owner" && callerRow?.role !== "admin") {
      return json({ error: "Only Admins and Superadmins can change committee tags." }, 403);
    }

    const { data: targetRow, error: targetError } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetRow) {
      return json({ error: "That person is not a member of this chapter." }, 404);
    }

    if (grant) {
      const { error } = await admin
        .from("member_committees")
        .upsert(
          { org_id: orgId, user_id: userId, committee, granted_by: callerUid },
          { onConflict: "org_id,user_id,committee", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("member_committees")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .eq("committee", committee);
      if (error) throw error;
    }

    // Best-effort: the Postgres write above is the source of truth and has already
    // succeeded. A Firebase hiccup here shouldn't surface as "failed to update committee
    // tag" when the tag itself was in fact updated -- the external app just checks a
    // temporarily-stale claim until this is retried (next toggle, or a future reconcile pass).
    try {
      await syncAppAccessClaim(userId, committee, grant);
    } catch (err) {
      console.error("Failed to sync Firebase app-access claim:", err);
    }

    let renewalsLink: RenewalsLink = "not_applicable";
    if (committee === "rrc") {
      if (grant) {
        renewalsLink = await linkRenewalsMember(admin, userId);
      } else {
        // The firebase_uid link is kept: it is also what gives the member self-scope in Renewals.
        const { error } = await admin
          .schema("renewals")
          .from("members")
          .update({ is_committee: false })
          .eq("firebase_uid", userId);
        if (error) throw error;
        renewalsLink = "unlinked";
      }
    }

    return json({ ok: true, committee, granted: grant, renewalsLink }, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Failed to update committee tag.") }, 500);
  }
});
