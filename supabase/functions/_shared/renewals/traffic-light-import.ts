// Adapted from bni-rrc's lib/renewals/traffic-light-import.ts. Business
// logic unchanged; adaptations: explicit `supabase` client param instead of
// a module-level getServiceSupabase() singleton, tables qualified into the
// `renewals` schema. The `Buffer` type comes from Deno's `node:buffer`.

import type { Buffer } from "node:buffer";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Member } from "./types.ts";
import { buildMemberNameResolver, loadMemberAliases } from "./member-aliases.ts";
import { parseTrafficLightPdfScoreReport, parseTrafficLightReport, parseTrafficLightXlsxReport, type ParsedTrafficLightScoreReport } from "./traffic-lights.ts";

export type TrafficLightImportResult = {
  batchId: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

function normalizeReportMonth(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);

  if (!match) {
    throw new Error("Report month must be in YYYY-MM format.");
  }

  return `${match[1]}-${match[2]}-01`;
}

export function formatImportError(error: unknown): string {
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

async function createTrafficLightImportBatch(
  supabase: SupabaseClient,
  input: {
    filename: string;
    reportMonth: string;
    reportWindowStart: string;
    sourceType: "traffic_lights_pdf" | "traffic_lights_xlsx";
  },
) {
  const table = supabase.schema("renewals").from("import_batches");
  const batchPayload = {
    filename: input.filename,
    report_date: input.reportMonth,
    source_type: input.sourceType,
    source_report_from: input.reportWindowStart,
    source_report_to: input.reportMonth,
    status: "pending",
  };
  const { data: batch, error: batchError } = await table.insert(batchPayload).select("id").single();

  if (batchError) {
    const message = formatImportError(batchError);

    if (input.sourceType === "traffic_lights_xlsx" && /source_type|constraint|check/i.test(message)) {
      const { data: fallbackBatch, error: fallbackBatchError } = await table
        .insert({
          ...batchPayload,
          source_type: "traffic_lights_pdf",
        })
        .select("id")
        .single();

      if (!fallbackBatchError) {
        return fallbackBatch;
      }

      throw fallbackBatchError;
    }

    throw batchError;
  }

  return batch;
}

async function loadMemberNameResolver(supabase: SupabaseClient): Promise<(name: string) => Member[]> {
  const { data: existingMembers, error: membersError } = await supabase.schema("renewals").from("members").select("*");

  if (membersError) {
    throw membersError;
  }

  const aliases = await loadMemberAliases(supabase);
  return buildMemberNameResolver((existingMembers ?? []) as Member[], aliases);
}

export async function importTrafficLightReport(
  supabase: SupabaseClient,
  text: string,
  filename: string,
  reportMonthOverride?: string | null,
): Promise<TrafficLightImportResult> {
  const table = supabase.schema("renewals").from("member_traffic_lights");
  const batchTable = supabase.schema("renewals").from("import_batches");
  const parsed = parseTrafficLightReport(text, normalizeReportMonth(reportMonthOverride ?? null));
  const errors: string[] = [];
  const batch = await createTrafficLightImportBatch(supabase, {
    filename,
    reportMonth: parsed.reportMonth,
    reportWindowStart: parsed.reportWindowStart,
    sourceType: "traffic_lights_pdf",
  });

  let importedCount = 0;
  let skippedCount = 0;

  try {
    const resolveMemberName = await loadMemberNameResolver(supabase);

    const records = [];

    for (const row of parsed.rows) {
      const matches = resolveMemberName(row.name);

      if (matches.length === 0) {
        skippedCount += 1;
        errors.push(`${row.name}: member not found`);
        continue;
      }

      if (matches.length > 1) {
        skippedCount += 1;
        errors.push(`${row.name}: multiple members matched this name`);
        continue;
      }

      records.push({
        member_id: matches[0].id,
        report_month: parsed.reportMonth,
        report_window_start: parsed.reportWindowStart,
        report_window_end: parsed.reportWindowEnd,
        score: row.score,
        color: row.color,
        present_count: row.presentCount,
        absent_count: row.absentCount,
        late_count: row.lateCount,
        medical_count: row.medicalCount,
        substitute_count: row.substituteCount,
        referrals_given: row.referralsGiven,
        referrals_received: row.referralsReceived,
        visitors: row.visitors,
        testimonials: row.testimonials,
        tyfcb: row.tyfcb,
        trainings: row.trainings,
        week_count: row.weekCount,
        import_batch_id: batch.id,
      });
    }

    if (records.length > 0) {
      const { error } = await table.upsert(records, { onConflict: "member_id,report_month" });

      if (error) {
        skippedCount += records.length;
        errors.push(formatImportError(error));
      } else {
        importedCount = records.length;
      }
    }

    await batchTable
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
    await batchTable
      .update({
        status: "failed",
        error_message: formatImportError(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    throw error;
  }
}

async function importTrafficLightScoreReport(
  supabase: SupabaseClient,
  parsed: ParsedTrafficLightScoreReport,
  filename: string,
  sourceType: "traffic_lights_pdf" | "traffic_lights_xlsx",
): Promise<TrafficLightImportResult> {
  const table = supabase.schema("renewals").from("member_traffic_lights");
  const batchTable = supabase.schema("renewals").from("import_batches");
  const errors: string[] = [];
  const batch = await createTrafficLightImportBatch(supabase, {
    filename,
    reportMonth: parsed.reportMonth,
    reportWindowStart: parsed.reportWindowStart,
    sourceType,
  });

  let importedCount = 0;
  let skippedCount = 0;

  try {
    const resolveMemberName = await loadMemberNameResolver(supabase);
    const matchedRows: Array<{
      member: Member;
      row: ParsedTrafficLightScoreReport["rows"][number];
    }> = [];

    for (const row of parsed.rows) {
      const matches = resolveMemberName(row.name);

      if (matches.length === 0) {
        skippedCount += 1;
        errors.push(`${row.name}: member not found`);
        continue;
      }

      if (matches.length > 1) {
        skippedCount += 1;
        errors.push(`${row.name}: multiple members matched this name`);
        continue;
      }

      matchedRows.push({ member: matches[0], row });
    }

    if (matchedRows.length > 0) {
      const memberIds = matchedRows.map((item) => item.member.id);
      const { data: existingRows, error: existingRowsError } = await table
        .select("member_id")
        .eq("report_month", parsed.reportMonth)
        .in("member_id", memberIds);

      if (existingRowsError) {
        throw existingRowsError;
      }

      const existingMemberIds = new Set(((existingRows ?? []) as Array<{ member_id: string }>).map((row) => row.member_id));
      const inserts = matchedRows
        .filter((item) => !existingMemberIds.has(item.member.id))
        .map((item) => ({
          member_id: item.member.id,
          report_month: parsed.reportMonth,
          report_window_start: parsed.reportWindowStart,
          report_window_end: parsed.reportWindowEnd,
          score: item.row.score,
          color: item.row.color,
          present_count: 0,
          absent_count: 0,
          late_count: 0,
          medical_count: 0,
          substitute_count: 0,
          referrals_given: 0,
          referrals_received: 0,
          visitors: 0,
          testimonials: 0,
          tyfcb: null,
          trainings: 0,
          week_count: 0,
          import_batch_id: batch.id,
        }));

      if (inserts.length > 0) {
        const { error } = await table.insert(inserts);

        if (error) {
          skippedCount += inserts.length;
          errors.push(formatImportError(error));
        } else {
          importedCount += inserts.length;
        }
      }

      for (const item of matchedRows.filter((row) => existingMemberIds.has(row.member.id))) {
        const { error } = await table
          .update({
            report_window_start: parsed.reportWindowStart,
            report_window_end: parsed.reportWindowEnd,
            score: item.row.score,
            color: item.row.color,
            import_batch_id: batch.id,
          })
          .eq("member_id", item.member.id)
          .eq("report_month", parsed.reportMonth);

        if (error) {
          skippedCount += 1;
          errors.push(`${item.row.name}: ${formatImportError(error)}`);
        } else {
          importedCount += 1;
        }
      }
    }

    await batchTable
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
    await batchTable
      .update({
        status: "failed",
        error_message: formatImportError(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    throw error;
  }
}

export async function importTrafficLightPdfScoreReport(
  supabase: SupabaseClient,
  text: string,
  filename: string,
  reportMonthOverride?: string | null,
): Promise<TrafficLightImportResult> {
  const parsed = parseTrafficLightPdfScoreReport(text, normalizeReportMonth(reportMonthOverride ?? null));
  return importTrafficLightScoreReport(supabase, parsed, filename, "traffic_lights_pdf");
}

export async function importTrafficLightXlsxReport(
  supabase: SupabaseClient,
  buffer: Buffer,
  filename: string,
  reportMonthOverride?: string | null,
): Promise<TrafficLightImportResult> {
  const parsed = parseTrafficLightXlsxReport(buffer, normalizeReportMonth(reportMonthOverride ?? null));
  return importTrafficLightScoreReport(supabase, parsed, filename, "traffic_lights_xlsx");
}
