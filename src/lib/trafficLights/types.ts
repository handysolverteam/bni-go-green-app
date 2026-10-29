/** One member's line of ONE imported week of the Chapter Summary PALMS Report (traffic_palms_weeks). */
export type PalmsWeekRecord = {
  weekFrom: string;
  weekTo: string;
  /** The Wednesday meeting of that week (places the week in a window). */
  meetingDate: string;
  memberName: string;
  p: number;
  a: number;
  l: number;
  m: number;
  s: number;
  rgi: number;
  rgo: number;
  rri: number;
  rro: number;
  visitors: number;
  oneToOnes: number;
  tyfcb: number;
  ceu: number;
  t: number;
};

/** One sponsored person of ONE imported week of the Chapter Sponsor Report (traffic_sponsor_weeks). */
export type SponsorWeekRecord = {
  weekFrom: string;
  weekTo: string;
  meetingDate: string;
  /** Empty for the marker row of a week in which nobody was sponsored. */
  sponsor: string;
  sponsored: string;
  sponsoredChapter: string | null;
  applicationDate: string | null;
};

/**
 * A meeting that has been imported, with what was imported for it. One entry per MEETING DATE: the PALMS and the Sponsor
 * report of the same Wednesday share it even when their From/To ranges differ (PALMS for 28 – 28 Oct, Sponsor for 22 – 28 Oct).
 */
export type ImportedWeek = {
  /** Earliest From / latest To of the reports imported for this meeting (the window a single-week view uses). */
  weekFrom: string;
  weekTo: string;
  meetingDate: string;
  hasPalms: boolean;
  members: number;
  /** The PALMS report's own From / To ("" when none). */
  palmsFrom: string;
  palmsTo: string;
  hasSponsorReport: boolean;
  sponsored: number;
  /** The Sponsor report's own From / To ("" when none). */
  sponsorFrom: string;
  sponsorTo: string;
};

/** One line of the import history (traffic_import_log): an import or a removal of a weekly report. */
export type ImportLogEntry = {
  id: string;
  action: 'import' | 'remove';
  kind: 'palms' | 'sponsor' | 'both';
  weekFrom: string;
  weekTo: string;
  meetingDate: string;
  /** null for imports done before the history existed. */
  filename: string | null;
  rows: number;
  /** The import replaced a week that was already imported. */
  replaced: boolean;
  importedBy: string | null;
  importedByName: string | null;
  at: string;
};
