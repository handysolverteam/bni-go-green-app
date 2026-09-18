// Adapted from bni-rrc's lib/renewals/sponsor-database-import.ts. Business
// logic unchanged; adaptations: explicit `supabase` client param instead of
// a module-level getServiceSupabase() singleton, every table qualified into
// the `renewals` schema.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Member, MemberAlias, MemberSponsorAchievement } from "./types.ts";
import { loadMemberAliases, matchRowsByMemberName } from "./member-aliases.ts";
import { normalizeImportKey, parseSponsorReport, type ParsedSponsorReport, type ParsedSponsorRow } from "./sponsor-import.ts";

export type ImportResult = {
  batchId: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

type SponsorAchievementRecordInput = Omit<MemberSponsorAchievement, "id">;
type ExistingSponsorAchievementRecord = MemberSponsorAchievement;

type ReconcileSponsorRowsInput = {
  desiredRecords: SponsorAchievementRecordInput[];
  existingRecords: ExistingSponsorAchievementRecord[];
};

export type SponsorRefreshPlan = {
  upsertRecords: SponsorAchievementRecordInput[];
  deleteIds: string[];
};

function formatImportError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [maybeError.message, maybeError.details, maybeError.hint]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
  }

  return "Import failed";
}

function sponsorNaturalKey(record: {
  member_id: string;
  sponsored_full_name: string;
  application_date: string;
  sponsored_chapter: string | null;
}): string {
  return [
    record.member_id,
    normalizeImportKey(record.sponsored_full_name),
    record.application_date,
    normalizeImportKey(record.sponsored_chapter ?? ""),
  ].join("|");
}

function buildSponsorMatches(
  rows: ParsedSponsorRow[],
  members: Member[],
  aliases: Pick<MemberAlias, "member_id" | "normalized_alias_name">[] = [],
): Array<{ row: ParsedSponsorRow; matches: Member[] }> {
  return matchRowsByMemberName(
    rows.map((row) => ({ ...row, name: row.sponsorFullName })),
    members,
    aliases,
  ).map((match) => ({ row: match.row, matches: match.matches }));
}

export function reconcileSponsorAchievementRecords({
  desiredRecords,
  existingRecords,
}: ReconcileSponsorRowsInput): SponsorRefreshPlan {
  const desiredByKey = new Map(desiredRecords.map((record) => [sponsorNaturalKey(record), record]));
  const existingByKey = new Map(existingRecords.map((record) => [sponsorNaturalKey(record), record]));

  const deleteIds = existingRecords
    .filter((record) => !desiredByKey.has(sponsorNaturalKey(record)))
    .map((record) => record.id);

  const upsertRecords = [...desiredByKey.values()].filter((record) => {
    const existing = existingByKey.get(sponsorNaturalKey(record));

    if (!existing) {
      return true;
    }

    return (
      existing.sponsored_first_name !== record.sponsored_first_name ||
      existing.sponsored_last_name !== record.sponsored_last_name ||
      existing.sponsored_region !== record.sponsored_region ||
      existing.sponsored_chapter !== record.sponsored_chapter ||
      existing.import_batch_id !== record.import_batch_id
    );
  });

  return {
    upsertRecords,
    deleteIds,
  };
}

export function buildDesiredSponsorRecords(
  parsed: ParsedSponsorReport,
  members: Member[],
  batchId: string,
  aliases: Pick<MemberAlias, "member_id" | "normalized_alias_name">[] = [],
): {
  desiredRecords: SponsorAchievementRecordInput[];
  skippedCount: number;
  errors: string[];
} {
  const desiredRecords: SponsorAchievementRecordInput[] = [];
  let skippedCount = 0;
  const errors: string[] = [];

  for (const match of buildSponsorMatches(parsed.rows, members, aliases)) {
    if (match.matches.length === 0) {
      skippedCount += 1;
      errors.push(`${match.row.sponsorFullName}: sponsor not found`);
      continue;
    }

    if (match.matches.length > 1) {
      skippedCount += 1;
      errors.push(`${match.row.sponsorFullName}: multiple members matched this sponsor`);
      continue;
    }

    desiredRecords.push({
      member_id: match.matches[0].id,
      sponsored_first_name: match.row.sponsoredFirstName,
      sponsored_last_name: match.row.sponsoredLastName,
      sponsored_full_name: match.row.sponsoredFullName,
      sponsored_region: match.row.sponsoredRegion,
      sponsored_chapter: match.row.sponsoredChapter ?? "",
      application_date: match.row.applicationDate,
      import_batch_id: batchId,
    });
  }

  return {
    desiredRecords,
    skippedCount,
    errors,
  };
}

export async function importSponsorReport(
  supabase: SupabaseClient,
  xml: string,
  filename: string,
): Promise<ImportResult> {
  const table = (name: string) => supabase.schema("renewals").from(name);
  const parsed = parseSponsorReport(xml);

  const { data: batch, error: batchError } = await table("import_batches")
    .insert({
      filename,
      report_date: parsed.reportTo,
      source_type: "chapter_sponsor_report",
      source_chapter_name: parsed.chapterName,
      source_report_from: parsed.reportFrom,
      source_report_to: parsed.reportTo,
      status: "pending",
    })
    .select("id")
    .single();

  if (batchError) {
    throw batchError;
  }

  try {
    const { data: existingMembers, error: membersError } = await table("members").select("*");

    if (membersError) {
      throw membersError;
    }

    const aliases = await loadMemberAliases(supabase);
    const { desiredRecords, skippedCount, errors } = buildDesiredSponsorRecords(
      parsed,
      (existingMembers ?? []) as Member[],
      batch.id,
      aliases,
    );

    const { data: existingSponsorAchievements, error: existingSponsorAchievementsError } = await table(
      "member_sponsor_achievements",
    ).select("*");

    if (existingSponsorAchievementsError) {
      throw existingSponsorAchievementsError;
    }

    const refreshPlan = reconcileSponsorAchievementRecords({
      desiredRecords,
      existingRecords: (existingSponsorAchievements ?? []) as ExistingSponsorAchievementRecord[],
    });

    if (refreshPlan.deleteIds.length > 0) {
      const { error } = await table("member_sponsor_achievements").delete().in("id", refreshPlan.deleteIds);

      if (error) {
        throw error;
      }
    }

    if (refreshPlan.upsertRecords.length > 0) {
      const { error } = await table("member_sponsor_achievements").upsert(refreshPlan.upsertRecords, {
        onConflict: "member_id,sponsored_full_name,application_date,sponsored_chapter",
      });

      if (error) {
        throw error;
      }
    }

    const importedCount = desiredRecords.length;

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
        error_message: formatImportError(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    throw error;
  }
}
