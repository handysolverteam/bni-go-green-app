// Adapted from bni-rrc's lib/renewals/database-import.ts (importMembershipDuesReport
// and its helpers only — that file also has palms/sponsor/training importers
// that belong to their own, separately-ported Edge Functions). Business logic
// is unchanged; adaptations: explicit `supabase` client param instead of a
// module-level getServiceSupabase() singleton, and every table qualified into
// the `renewals` schema (see supabase/migrations/004_renewals_schema.sql).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ImportMemberRow, Member, RenewalCycle } from "./types.ts";
import { normalizeImportKey, parseMembershipDuesReport } from "./import-parser.ts";
import { buildMemberNameResolver, loadMemberAliases } from "./member-aliases.ts";

export type ImportResult = {
  batchId: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

type ImportedRenewalCycleInput = {
  renewalYear: number;
  renewalDate: string;
  reportedDueDate: string | null;
  isTwoYearRenewal: boolean;
};

function renewalYearFromDate(date: string): number {
  return Number(date.slice(0, 4));
}

function parseDateParts(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function toDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getImportReferenceYear(reportDate: string | null, today = new Date()): number {
  if (reportDate) {
    return renewalYearFromDate(reportDate);
  }

  return today.getUTCFullYear();
}

export function deriveImportedRenewalCycle(
  dueDate: string,
  referenceYear: number,
): ImportedRenewalCycleInput {
  const dueParts = parseDateParts(dueDate);

  if (dueParts.year > referenceYear) {
    return {
      renewalYear: referenceYear,
      renewalDate: toDateOnly(referenceYear, dueParts.month, dueParts.day),
      reportedDueDate: dueDate,
      isTwoYearRenewal: true,
    };
  }

  return {
    renewalYear: dueParts.year,
    renewalDate: dueDate,
    reportedDueDate: null,
    isTwoYearRenewal: false,
  };
}

function memberKey(member: Pick<Member, "name" | "industry">): string {
  return `${normalizeImportKey(member.name)}|${normalizeImportKey(member.industry ?? "")}`;
}

export async function importMembershipDuesReport(
  supabase: SupabaseClient,
  xml: string,
  filename: string,
): Promise<ImportResult> {
  const table = (name: string) => supabase.schema("renewals").from(name);
  const parsed = parseMembershipDuesReport(xml);
  const referenceYear = getImportReferenceYear(parsed.reportDate);
  const errors: string[] = [];

  const { data: batch, error: batchError } = await table("import_batches")
    .insert({
      filename,
      report_date: parsed.reportDate,
      source_type: "membership_dues_xls",
      status: "pending",
    })
    .select("id")
    .single();

  if (batchError) {
    throw batchError;
  }

  let importedCount = 0;
  let skippedCount = 0;

  try {
    const { data: existingMembers, error: membersError } = await table("members").select("*");

    if (membersError) {
      throw membersError;
    }

    const membersByKey = new Map(
      ((existingMembers ?? []) as Member[]).map((member) => [memberKey(member), member]),
    );
    const existingMemberRows = (existingMembers ?? []) as Member[];
    const memberAliases = await loadMemberAliases(supabase);
    const resolveMemberName = buildMemberNameResolver(existingMemberRows, memberAliases);

    for (const row of parsed.rows) {
      try {
        const member = await upsertMember(supabase, row, membersByKey, resolveMemberName);
        await upsertRenewalCycle(supabase, member.id, row, referenceYear);
        importedCount += 1;
      } catch (error) {
        skippedCount += 1;
        errors.push(`${row.name}: ${error instanceof Error ? error.message : "Import failed"}`);
      }
    }

    await table("import_batches")
      .update({
        imported_count: importedCount,
        skipped_count: skippedCount,
        status: errors.length > 0 ? "failed" : "completed",
        error_message: errors.length > 0 ? errors.join("\n") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    return {
      batchId: batch.id,
      importedCount,
      skippedCount,
      errors,
    };
  } catch (error) {
    await table("import_batches")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Import failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    throw error;
  }
}

async function upsertMember(
  supabase: SupabaseClient,
  row: ImportMemberRow,
  membersByKey: Map<string, Member>,
  resolveMemberName: (name: string) => Member[],
): Promise<Member> {
  const table = supabase.schema("renewals").from("members");
  const key = `${normalizeImportKey(row.name)}|${normalizeImportKey(row.industry)}`;
  const aliasMatches = membersByKey.has(key) ? [] : resolveMemberName(row.name);
  const existing = membersByKey.get(key) ?? aliasMatches[0];

  if (!membersByKey.has(key) && aliasMatches.length > 1) {
    throw new Error("multiple members matched this alias");
  }

  if (existing) {
    const { data, error } = await table
      .update({
        name: row.name.trim(),
        industry: row.industry.trim(),
        report_role: row.reportRole,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    membersByKey.set(key, data as Member);
    return data as Member;
  }

  const { data, error } = await table
    .insert({
      name: row.name.trim(),
      industry: row.industry.trim(),
      report_role: row.reportRole,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  membersByKey.set(key, data as Member);
  return data as Member;
}

async function upsertRenewalCycle(
  supabase: SupabaseClient,
  memberId: string,
  row: ImportMemberRow,
  referenceYear: number,
): Promise<RenewalCycle> {
  const table = supabase.schema("renewals").from("renewal_cycles");
  const importedCycle = deriveImportedRenewalCycle(row.dueDate, referenceYear);
  const { data: existing, error: selectError } = await table
    .select("*")
    .eq("member_id", memberId)
    .eq("renewal_year", importedCycle.renewalYear)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  const legacyFutureCycle =
    importedCycle.isTwoYearRenewal && !existing
      ? await findLegacyFutureCycle(supabase, memberId, row.dueDate)
      : null;

  if (existing) {
    const { data, error } = await table
      .update({
        renewal_date: importedCycle.renewalDate,
        reported_due_date: importedCycle.reportedDueDate,
        source_membership_status: row.membershipStatus,
        auto_renewal_enabled: row.autoRenewalEnabled,
        is_two_year_renewal: importedCycle.isTwoYearRenewal,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data as RenewalCycle;
  }

  if (legacyFutureCycle) {
    const { data, error } = await table
      .update({
        renewal_year: importedCycle.renewalYear,
        renewal_date: importedCycle.renewalDate,
        reported_due_date: importedCycle.reportedDueDate,
        source_membership_status: row.membershipStatus,
        auto_renewal_enabled: row.autoRenewalEnabled,
        is_two_year_renewal: importedCycle.isTwoYearRenewal,
      })
      .eq("id", legacyFutureCycle.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data as RenewalCycle;
  }

  const { data, error } = await table
    .insert({
      member_id: memberId,
      renewal_year: importedCycle.renewalYear,
      renewal_date: importedCycle.renewalDate,
      reported_due_date: importedCycle.reportedDueDate,
      source_membership_status: row.membershipStatus,
      auto_renewal_enabled: row.autoRenewalEnabled,
      is_two_year_renewal: importedCycle.isTwoYearRenewal,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as RenewalCycle;
}

async function findLegacyFutureCycle(
  supabase: SupabaseClient,
  memberId: string,
  reportedDueDate: string,
): Promise<RenewalCycle | null> {
  const { data, error } = await supabase
    .schema("renewals")
    .from("renewal_cycles")
    .select("*")
    .eq("member_id", memberId)
    .eq("renewal_year", renewalYearFromDate(reportedDueDate))
    .eq("renewal_date", reportedDueDate)
    .is("reported_due_date", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RenewalCycle | null) ?? null;
}
