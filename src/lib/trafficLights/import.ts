import { parsePalmsChapterSummaryReport } from '../renewals/palms-import';
import { parseSponsorReport } from '../renewals/sponsor-import';
import type { PalmsWeekRecord, SponsorWeekRecord } from './types';
import { findConflict, meetingDateOf, rangeLabel, sameRange, validateWeekRange, type WeekRange } from './weeks';

export type PalmsImportRow = Omit<PalmsWeekRecord, 'weekFrom' | 'weekTo' | 'meetingDate'>;
export type SponsorImportRow = Omit<SponsorWeekRecord, 'weekFrom' | 'weekTo' | 'meetingDate'>;

type Common = {
  filename: string;
  chapterName: string | null;
  from: string;
  to: string;
  meetingDate: string;
  /** The same week is already imported: importing replaces it. */
  replaces: boolean;
};
export type PreparedReport =
  | (Common & { kind: 'palms'; rows: PalmsImportRow[] })
  | (Common & { kind: 'sponsor'; rows: SponsorImportRow[] });

export type PrepareResult = { ok: true; report: PreparedReport } | { ok: false; error: string };

/** Which BNI report a SpreadsheetML .xls is, from its header cells. */
export function detectReportKind(text: string): 'palms' | 'sponsor' | null {
  if (/Sponsor First Name/i.test(text) && /Application Date/i.test(text)) return 'sponsor';
  if (/>\s*RGI\s*</.test(text) && /1-2-1/.test(text)) return 'palms';
  return null;
}

/** "BNI Influencers" and "Influencers" are the same chapter. */
export const chapterKey = (raw: string | null | undefined): string =>
  String(raw ?? '')
    .split(',')[0]
    .toLowerCase()
    .replace(/^bni\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function chapterMatches(fileChapter: string | null, orgNames: Array<string | null | undefined>): boolean {
  const file = chapterKey(fileChapter);
  const candidates = orgNames.map(chapterKey).filter(Boolean);
  if (!file || candidates.length === 0) return true; // nothing to compare against
  return candidates.includes(file);
}

/**
 * Read one report file (the .xls text) and decide whether it can be imported as ONE week of this chapter: it must be
 * a Chapter Summary PALMS Report or a Chapter Sponsor Report, name this chapter, cover a single week and not overlap
 * a different week that is already imported (that would count the same days twice).
 */
export function prepareTrafficReport(
  filename: string,
  text: string,
  opts: { orgNames?: Array<string | null | undefined>; existingPalms: WeekRange[]; existingSponsors: WeekRange[] },
): PrepareResult {
  const kind = detectReportKind(text);
  if (!kind) {
    return { ok: false, error: `${filename}: not a Traffic Lights report — upload the Chapter Summary PALMS Report or the Chapter Sponsor Report (.xls).` };
  }

  let chapterName: string | null;
  let from: string | null;
  let to: string | null;
  let palmsRows: PalmsImportRow[] = [];
  let sponsorRows: SponsorImportRow[] = [];
  try {
    if (kind === 'palms') {
      const parsed = parsePalmsChapterSummaryReport(text);
      ({ chapterName, reportFrom: from, reportTo: to } = parsed);
      palmsRows = parsed.rows.map((r) => ({
        memberName: r.name,
        p: r.presentCount,
        a: r.absentCount,
        l: r.lateCount,
        m: r.medicalCount,
        s: r.substituteCount,
        rgi: r.referralsGivenInside,
        rgo: r.referralsGivenOutside,
        rri: r.referralsReceivedInside,
        rro: r.referralsReceivedOutside,
        visitors: r.visitors,
        oneToOnes: r.oneToOnes,
        tyfcb: r.tyfcb ?? 0,
        ceu: r.ceu,
        t: r.trainings,
      }));
      if (palmsRows.length === 0) return { ok: false, error: `${filename}: no member rows were found in the report.` };
    } else {
      const parsed = parseSponsorReport(text);
      ({ chapterName, reportFrom: from, reportTo: to } = parsed);
      sponsorRows = parsed.rows.map((r) => ({
        sponsor: r.sponsorFullName,
        sponsored: r.sponsoredFullName,
        sponsoredChapter: r.sponsoredChapter,
        applicationDate: r.applicationDate,
      }));
    }
  } catch (e) {
    return { ok: false, error: `${filename}: ${e instanceof Error ? e.message : 'the report could not be read.'}` };
  }

  if (!chapterMatches(chapterName, opts.orgNames ?? [])) {
    return { ok: false, error: `${filename}: this report is for the chapter "${chapterName}", not your chapter.` };
  }
  const rangeError = validateWeekRange(from, to);
  if (rangeError) return { ok: false, error: `${filename}: ${rangeError}` };
  const range = { from: from as string, to: to as string };

  const existing = kind === 'palms' ? opts.existingPalms : opts.existingSponsors;
  const conflict = findConflict(existing, range);
  if (conflict) {
    return {
      ok: false,
      error: `${filename}: ${rangeLabel(range.from, range.to)} overlaps the already imported week ${rangeLabel(conflict.from, conflict.to)}. Remove that week first, or import the exact same week to replace it.`,
    };
  }

  const common: Common = {
    filename,
    chapterName,
    from: range.from,
    to: range.to,
    meetingDate: meetingDateOf(range.from, range.to),
    replaces: existing.some((e) => sameRange(e, range)),
  };
  return {
    ok: true,
    report: kind === 'palms' ? { ...common, kind, rows: palmsRows } : { ...common, kind, rows: sponsorRows },
  };
}
