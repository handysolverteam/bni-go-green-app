// Adapted from bni-rrc's lib/renewals/training-database-import.ts. Business
// logic unchanged; adaptations: explicit `supabase` client param instead of
// a module-level getServiceSupabase() singleton, every table qualified into
// the `renewals` schema.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Member, MemberAlias, MemberTrainingAchievement } from "./types.ts";
import { loadMemberAliases, matchRowsByMemberName } from "./member-aliases.ts";
import { normalizeImportKey } from "./sponsor-import.ts";
import { parseTrainingReport, type ParsedTrainingReport, type ParsedTrainingRow } from "./training-import.ts";

export type ImportResult = {
  batchId: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

type TrainingAchievementRecordInput = Omit<MemberTrainingAchievement, "id">;

function trainingNaturalKey(record: {
  member_id: string;
  chapter_name: string;
  event_date: string;
  event_type: string;
}): string {
  return [
    record.member_id,
    normalizeImportKey(record.chapter_name),
    record.event_date,
    normalizeImportKey(record.event_type),
  ].join("|");
}

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

function buildTrainingMatches(
  rows: ParsedTrainingRow[],
  members: Member[],
  aliases: Pick<MemberAlias, "member_id" | "normalized_alias_name">[] = [],
): Array<{ row: ParsedTrainingRow; matches: Member[] }> {
  return matchRowsByMemberName(
    rows.map((row) => ({ ...row, name: row.memberName })),
    members,
    aliases,
  ).map((match) => ({ row: match.row, matches: match.matches }));
}

export function buildDesiredTrainingRecords(
  parsed: ParsedTrainingReport,
  members: Member[],
  batchId: string,
  aliases: Pick<MemberAlias, "member_id" | "normalized_alias_name">[] = [],
): {
  desiredRecords: TrainingAchievementRecordInput[];
  skippedCount: number;
  errors: string[];
} {
  const desiredRecords: TrainingAchievementRecordInput[] = [];
  let skippedCount = 0;
  const errors: string[] = [];

  for (const match of buildTrainingMatches(parsed.rows, members, aliases)) {
    if (match.matches.length === 0) {
      skippedCount += 1;
      errors.push(`${match.row.memberName}: member not found`);
      continue;
    }

    if (match.matches.length > 1) {
      skippedCount += 1;
      errors.push(`${match.row.memberName}: multiple members matched this name`);
      continue;
    }

    desiredRecords.push({
      member_id: match.matches[0].id,
      chapter_name: match.row.chapterName ?? parsed.chapterName ?? "",
      region_name: match.row.regionName,
      event_date: match.row.eventDate,
      event_type: match.row.eventType,
      role: match.row.role,
      join_date: match.row.joinDate,
      induction_date: match.row.inductionDate,
      import_batch_id: batchId,
    });
  }

  const dedupedRecords = [...new Map(desiredRecords.map((record) => [trainingNaturalKey(record), record])).values()];

  return {
    desiredRecords: dedupedRecords,
    skippedCount,
    errors,
  };
}

export async function importTrainingReport(
  supabase: SupabaseClient,
  xml: string,
  filename: string,
): Promise<ImportResult> {
  const table = (name: string) => supabase.schema("renewals").from(name);
  const parsed = parseTrainingReport(xml);

  const { data: batch, error: batchError } = await table("import_batches")
    .insert({
      filename,
      report_date: parsed.reportTo,
      source_type: "chapter_member_training_report",
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
    const { desiredRecords, skippedCount, errors } = buildDesiredTrainingRecords(
      parsed,
      (existingMembers ?? []) as Member[],
      batch.id,
      aliases,
    );

    const matchedMemberIds = [...new Set(desiredRecords.map((record) => record.member_id))];
    let existingKeys = new Set<string>();

    if (matchedMemberIds.length > 0) {
      const { data: existingAchievements, error: existingAchievementsError } = await table(
        "member_training_achievements",
      )
        .select("member_id, chapter_name, event_date, event_type")
        .in("member_id", matchedMemberIds);

      if (existingAchievementsError) {
        throw existingAchievementsError;
      }

      existingKeys = new Set(
        (
          (existingAchievements ?? []) as Array<
            Pick<MemberTrainingAchievement, "member_id" | "chapter_name" | "event_date" | "event_type">
          >
        ).map((record) => trainingNaturalKey(record)),
      );
    }

    const newRecords = desiredRecords.filter((record) => !existingKeys.has(trainingNaturalKey(record)));
    const duplicateCount = desiredRecords.length - newRecords.length;

    if (newRecords.length > 0) {
      const { error } = await table("member_training_achievements").insert(newRecords);

      if (error) {
        throw error;
      }
    }

    const importedCount = newRecords.length;

    await table("import_batches")
      .update({
        imported_count: importedCount,
        skipped_count: skippedCount + duplicateCount,
        status: errors.length > 0 ? "failed" : "completed",
        error_message: errors.length > 0 ? errors.join("\n") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    return {
      batchId: batch.id,
      importedCount,
      skippedCount: skippedCount + duplicateCount,
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
