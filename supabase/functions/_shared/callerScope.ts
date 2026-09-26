// RBAC Phase 3: works out who is calling a Renewals/import function and what Renewals scope
// they would get once enforcement is switched on. For now it is LOG-ONLY -- logCallerScope()
// never throws and never changes a response, so the computed scope can be checked against
// real traffic before it gates anything (see the approved RBAC plan, Phase 3 / Phase 7).
//
// Scope rules mirror src/lib/permissions.ts's hasFullRenewalsAccess():
//   committee -> Admin/Superadmin of any org, or holds the `rrc` committee tag
//   self      -> no committee access, but linked to a renewals.members row (firebase_uid)
//   none      -> anonymous, unverifiable token, or signed in but unlinked
//
// renewals.* has no org_id (single-tenant, inherited from bni-rrc), so "Admin of any org"
// cannot yet be narrowed to the chapter that owns the renewals data. Known gap, see the plan.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseIdToken } from "./firebaseAdmin.ts";
import { extractErrorMessage } from "./renewals/error-message.ts";

export type RenewalsScope = "committee" | "self" | "none";

export interface CallerScope {
  uid: string | null;
  renewalsScope: RenewalsScope;
  adminOrgIds: string[];
  rrcOrgIds: string[];
  renewalsMemberId: string | null;
  reason?: string;
}

const anonymous = (reason: string): CallerScope => ({
  uid: null,
  renewalsScope: "none",
  adminOrgIds: [],
  rrcOrgIds: [],
  renewalsMemberId: null,
  reason,
});

export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<CallerScope> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return anonymous("no bearer token");

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(token));
  } catch {
    // Signed-out callers send the anon key, which is not a Firebase token.
    return anonymous("bearer is not a valid Firebase ID token");
  }

  const [roles, committees, member] = await Promise.all([
    admin.from("org_members").select("org_id, role").eq("user_id", uid),
    admin.from("member_committees").select("org_id").eq("user_id", uid).eq("committee", "rrc"),
    admin.schema("renewals").from("members").select("id").eq("firebase_uid", uid).limit(1).maybeSingle(),
  ]);

  if (roles.error) throw roles.error;
  if (committees.error) throw committees.error;
  if (member.error) throw member.error;

  const adminOrgIds = (roles.data ?? [])
    .filter((row) => row.role === "owner" || row.role === "admin")
    .map((row) => row.org_id as string);
  const rrcOrgIds = (committees.data ?? []).map((row) => row.org_id as string);
  const renewalsMemberId = (member.data?.id as string | undefined) ?? null;

  const renewalsScope: RenewalsScope =
    adminOrgIds.length > 0 || rrcOrgIds.length > 0 ? "committee" : renewalsMemberId ? "self" : "none";

  return { uid, renewalsScope, adminOrgIds, rrcOrgIds, renewalsMemberId };
}

/** Logs the computed scope as one JSON line tagged `rbac_scope_log`. Never throws. */
export async function logCallerScope(
  req: Request,
  admin: SupabaseClient,
  fn: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const scope = await resolveCaller(req, admin);
    console.log(JSON.stringify({ rbac_scope_log: true, fn, ...detail, ...scope }));
  } catch (err) {
    console.log(
      JSON.stringify({ rbac_scope_log: true, fn, ...detail, error: extractErrorMessage(err, "scope resolution failed") }),
    );
  }
}
