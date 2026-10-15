import { supabase } from '../lib/supabase';
import type { PreparedReport } from '../lib/trafficLights/import';
import type { ImportLogEntry, PalmsWeekRecord, SponsorWeekRecord } from '../lib/trafficLights/types';

/** The Traffic Lights tables do not exist yet (migration 014 has not been run). */
export class TrafficLightsSetupError extends Error {
  constructor() {
    super('Traffic Lights is not set up yet: run supabase/migrations/014_traffic_lights.sql in the Supabase SQL editor.');
    this.name = 'TrafficLightsSetupError';
  }
}

const PAGE = 1000;

type DbError = { code?: string; message: string };
const isMissingTable = (e: DbError): boolean =>
  e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message);

function fail(e: DbError): never {
  if (isMissingTable(e)) throw new TrafficLightsSetupError();
  throw new Error(e.message);
}

/** Every row of a table for one chapter. One response is capped at 1000 rows, so this pages. */
async function fetchAll<T>(table: string, columns: string, orgId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('org_id', orgId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) fail(error);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

type PalmsDb = {
  week_from: string;
  week_to: string;
  meeting_date: string;
  member_name: string;
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
  one_to_ones: number;
  tyfcb: number | string;
  ceu: number | string;
  t: number;
};

type SponsorDb = {
  week_from: string;
  week_to: string;
  meeting_date: string;
  sponsor_name: string;
  sponsored_name: string;
  sponsored_chapter: string | null;
  application_date: string | null;
};

const PALMS_COLUMNS = 'week_from,week_to,meeting_date,member_name,p,a,l,m,s,rgi,rgo,rri,rro,visitors,one_to_ones,tyfcb,ceu,t';
const SPONSOR_COLUMNS = 'week_from,week_to,meeting_date,sponsor_name,sponsored_name,sponsored_chapter,application_date';

const INSERT_CHUNK = 500;

type LogDb = {
  id: string;
  action: 'import' | 'remove';
  kind: 'palms' | 'sponsor' | 'both';
  week_from: string;
  week_to: string;
  meeting_date: string;
  filename: string | null;
  rows_imported: number;
  replaced: boolean;
  imported_by: string | null;
  imported_by_name: string | null;
  imported_at: string;
};

/** Who did it: stored with each history line. */
export type Actor = { userId: string | null; userName: string | null };

/** Best effort: a missing history table (migration 015 not run) or a failed write never blocks the import itself. */
async function logEvent(row: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('traffic_import_log').insert(row);
  } catch {
    /* history is a convenience */
  }
}

export const trafficLightsService = {
  /** Every imported week of the chapter (PALMS lines + Sponsor Report lines). */
  async fetchWeeks(orgId: string): Promise<{ palms: PalmsWeekRecord[]; sponsors: SponsorWeekRecord[] }> {
    const [palms, sponsors] = await Promise.all([
      fetchAll<PalmsDb>('traffic_palms_weeks', PALMS_COLUMNS, orgId),
      fetchAll<SponsorDb>('traffic_sponsor_weeks', SPONSOR_COLUMNS, orgId),
    ]);
    return {
      palms: palms.map((r) => ({
        weekFrom: r.week_from,
        weekTo: r.week_to,
        meetingDate: r.meeting_date,
        memberName: r.member_name,
        p: r.p,
        a: r.a,
        l: r.l,
        m: r.m,
        s: r.s,
        rgi: r.rgi,
        rgo: r.rgo,
        rri: r.rri,
        rro: r.rro,
        visitors: r.visitors,
        oneToOnes: r.one_to_ones,
        tyfcb: Number(r.tyfcb ?? 0),
        ceu: Number(r.ceu ?? 0),
        t: r.t,
      })),
      sponsors: sponsors.map((r) => ({
        weekFrom: r.week_from,
        weekTo: r.week_to,
        meetingDate: r.meeting_date,
        sponsor: r.sponsor_name,
        sponsored: r.sponsored_name,
        sponsoredChapter: r.sponsored_chapter,
        applicationDate: r.application_date,
      })),
    };
  },

  /** Save one prepared week. The same week imported again replaces the old rows. Returns the rows saved. */
  async importReport(orgId: string, actor: Actor, report: PreparedReport): Promise<number> {
    const table = report.kind === 'palms' ? 'traffic_palms_weeks' : 'traffic_sponsor_weeks';
    const base = {
      org_id: orgId,
      week_from: report.from,
      week_to: report.to,
      meeting_date: report.meetingDate,
      imported_by: actor.userId,
    };
    const rows: Record<string, unknown>[] =
      report.kind === 'palms'
        ? report.rows.map((r) => ({
            ...base,
            member_name: r.memberName,
            p: r.p,
            a: r.a,
            l: r.l,
            m: r.m,
            s: r.s,
            rgi: r.rgi,
            rgo: r.rgo,
            rri: r.rri,
            rro: r.rro,
            visitors: r.visitors,
            one_to_ones: r.oneToOnes,
            tyfcb: r.tyfcb,
            ceu: r.ceu,
            t: r.t,
          }))
        : report.rows.length > 0
          ? report.rows.map((r) => ({
              ...base,
              sponsor_name: r.sponsor,
              sponsored_name: r.sponsored,
              sponsored_chapter: r.sponsoredChapter,
              application_date: r.applicationDate,
            }))
          : // Nobody was sponsored that week — a marker row still records that the report was imported.
            [{ ...base, sponsor_name: '', sponsored_name: '' }];

    const del = await supabase.from(table).delete().eq('org_id', orgId).eq('week_from', report.from).eq('week_to', report.to);
    if (del.error) fail(del.error);
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await supabase.from(table).insert(rows.slice(i, i + INSERT_CHUNK));
      if (error) fail(error);
    }
    const saved = report.kind === 'palms' ? rows.length : report.rows.length;
    await logEvent({
      org_id: orgId,
      action: 'import',
      kind: report.kind,
      week_from: report.from,
      week_to: report.to,
      meeting_date: report.meetingDate,
      filename: report.filename,
      rows_imported: saved,
      replaced: report.replaces,
      imported_by: actor.userId,
      imported_by_name: actor.userName,
    });
    return saved;
  },

  /** Delete the data of ONE imported file: its report type (PALMS or Sponsor) for one week. The week can be imported again. */
  async deleteReport(
    orgId: string,
    kind: 'palms' | 'sponsor',
    weekFrom: string,
    weekTo: string,
    actor: Actor,
    meetingDate: string,
    filename: string | null,
  ): Promise<void> {
    const table = kind === 'palms' ? 'traffic_palms_weeks' : 'traffic_sponsor_weeks';
    const { error } = await supabase.from(table).delete().eq('org_id', orgId).eq('week_from', weekFrom).eq('week_to', weekTo);
    if (error) fail(error);
    await logEvent({
      org_id: orgId,
      action: 'remove',
      kind,
      week_from: weekFrom,
      week_to: weekTo,
      meeting_date: meetingDate,
      filename,
      rows_imported: 0,
      replaced: false,
      imported_by: actor.userId,
      imported_by_name: actor.userName,
    });
  },

  /** Remove one imported week (both its PALMS and its Sponsor Report rows). */
  async deleteWeek(orgId: string, weekFrom: string, weekTo: string, actor?: Actor, meetingDate?: string): Promise<void> {
    for (const table of ['traffic_palms_weeks', 'traffic_sponsor_weeks']) {
      const { error } = await supabase.from(table).delete().eq('org_id', orgId).eq('week_from', weekFrom).eq('week_to', weekTo);
      if (error) fail(error);
    }
    await logEvent({
      org_id: orgId,
      action: 'remove',
      kind: 'both',
      week_from: weekFrom,
      week_to: weekTo,
      meeting_date: meetingDate ?? weekTo,
      filename: null,
      rows_imported: 0,
      replaced: false,
      imported_by: actor?.userId ?? null,
      imported_by_name: actor?.userName ?? null,
    });
  },

  /** The import history, newest first. Null when migration 015 has not been run (the screen then says so). */
  async fetchImportLog(orgId: string): Promise<ImportLogEntry[] | null> {
    const rows: LogDb[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('traffic_import_log')
        .select('id,action,kind,week_from,week_to,meeting_date,filename,rows_imported,replaced,imported_by,imported_by_name,imported_at')
        .eq('org_id', orgId)
        .order('imported_at', { ascending: false })
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) {
        if (isMissingTable(error)) return null;
        throw new Error(error.message);
      }
      const page = (data ?? []) as LogDb[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      kind: r.kind,
      weekFrom: r.week_from,
      weekTo: r.week_to,
      meetingDate: r.meeting_date,
      filename: r.filename,
      rows: r.rows_imported,
      replaced: r.replaced,
      importedBy: r.imported_by,
      importedByName: r.imported_by_name,
      at: r.imported_at,
    }));
  },
};
