import { describe, expect, it } from 'vitest';
import { liveImportIds } from '../history';
import type { ImportedWeek, ImportLogEntry } from '../types';

const week = (o: Partial<ImportedWeek> & { weekFrom: string; weekTo: string }): ImportedWeek => ({
  meetingDate: o.weekTo,
  hasPalms: true,
  members: 76,
  palmsFrom: o.weekFrom,
  palmsTo: o.weekTo,
  hasSponsorReport: true,
  sponsored: 1,
  sponsorFrom: o.weekFrom,
  sponsorTo: o.weekTo,
  ...o,
});
let n = 0;
const entry = (o: Partial<ImportLogEntry> & { weekFrom: string; weekTo: string; kind: ImportLogEntry['kind'] }): ImportLogEntry => ({
  id: `e${++n}`,
  action: 'import',
  meetingDate: o.weekTo,
  filename: 'f.xls',
  rows: 1,
  replaced: false,
  importedBy: 'u1',
  importedByName: 'Admin',
  at: '2026-10-14T10:00:00Z',
  ...o,
});

describe('liveImportIds', () => {
  const W = { weekFrom: '2026-10-08', weekTo: '2026-10-14' };

  it('the newest import of a report type is the one in use; the one it replaced is not', () => {
    const older = entry({ ...W, kind: 'palms', at: '2026-10-14T09:00:00Z' });
    const newer = entry({ ...W, kind: 'palms', replaced: true, at: '2026-10-14T10:00:00Z' });
    const live = liveImportIds([newer, older], [week(W)]);
    expect(live.has(newer.id)).toBe(true);
    expect(live.has(older.id)).toBe(false);
  });

  it('PALMS and Sponsor are tracked separately', () => {
    const palms = entry({ ...W, kind: 'palms' });
    const sponsor = entry({ ...W, kind: 'sponsor' });
    expect(liveImportIds([sponsor, palms], [week(W)])).toEqual(new Set([palms.id, sponsor.id]));
  });

  it('a deleted file is no longer in use, and importing it again makes the new line the live one', () => {
    const first = entry({ ...W, kind: 'palms', at: '2026-10-14T09:00:00Z' });
    const del = entry({ ...W, kind: 'palms', action: 'remove', at: '2026-10-14T10:00:00Z' });
    expect(liveImportIds([del, first], [week({ ...W, hasPalms: false })]).size).toBe(0);
    const again = entry({ ...W, kind: 'palms', at: '2026-10-14T11:00:00Z' });
    expect(liveImportIds([again, del, first], [week(W)])).toEqual(new Set([again.id]));
  });

  it('removing the whole week (kind both) ends both reports', () => {
    const palms = entry({ ...W, kind: 'palms', at: '2026-10-14T09:00:00Z' });
    const sponsor = entry({ ...W, kind: 'sponsor', at: '2026-10-14T09:01:00Z' });
    const removed = entry({ ...W, kind: 'both', action: 'remove', at: '2026-10-14T10:00:00Z' });
    expect(liveImportIds([removed, sponsor, palms], []).size).toBe(0);
  });

  it('the two reports of one meeting count as in use even when their From/To ranges differ', () => {
    // PALMS exported for 28 – 28 Oct, the Sponsor report for 22 – 28 Oct: the same Wednesday.
    const palms = entry({ weekFrom: '2026-10-28', weekTo: '2026-10-28', kind: 'palms' });
    const sponsor = entry({ weekFrom: '2026-10-22', weekTo: '2026-10-28', meetingDate: '2026-10-28', kind: 'sponsor' });
    const stored = week({ weekFrom: '2026-10-22', weekTo: '2026-10-28', meetingDate: '2026-10-28', palmsFrom: '2026-10-28', palmsTo: '2026-10-28', sponsorFrom: '2026-10-22', sponsorTo: '2026-10-28' });
    expect(liveImportIds([sponsor, palms], [stored])).toEqual(new Set([palms.id, sponsor.id]));
  });

  it('an import whose rows are no longer stored is not in use', () => {
    const palms = entry({ ...W, kind: 'palms' });
    expect(liveImportIds([palms], [week({ ...W, hasPalms: false })]).size).toBe(0);
  });
});
