import type { ParsedPalmsReport } from "./palms-import";
import { isExactMonthlyPalmsWindow } from "./palms-monthly-performance";

/**
 * Extracted from bni-rrc's lib/renewals/palms-database-import.ts, which also
 * contains the actual Supabase writes (service-role key) and so is NOT
 * ported here (see docs/BNI_RRC_MIGRATION.md — that whole file is Phase 2,
 * an Edge Function). This one function has no database dependency at all —
 * it only validates a parsed report's date window — so it lives here as its
 * own pure module rather than waiting on Phase 2. When palms-database-import.ts
 * is ported as an Edge Function, it should import this function from here
 * rather than duplicating it.
 */
export type PalmsImportMode = "monthly" | "lifetime";

export function validatePalmsReportWindow(parsed: ParsedPalmsReport, mode: PalmsImportMode): void {
  if (!parsed.reportTo) {
    throw new Error("PALMS report end date was not found.");
  }

  if (!parsed.reportFrom) {
    throw new Error("PALMS report start date was not found.");
  }

  const isMonthly = isExactMonthlyPalmsWindow({
    report_from: parsed.reportFrom,
    report_to: parsed.reportTo,
  });

  if (mode === "monthly" && !isMonthly) {
    throw new Error("This PALMS file is not a single calendar month.");
  }

  if (mode === "lifetime" && isMonthly) {
    throw new Error("This is a monthly PALMS file. Use the monthly PALMS upload instead.");
  }
}
