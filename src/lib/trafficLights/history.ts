import type { ImportedWeek, ImportLogEntry } from './types';

/**
 * The history lines whose data is still in use: for each report type of each MEETING DATE, the NEWEST event decides — an
 * import that no later import replaced and no removal deleted, and whose rows are still stored. Those are the lines
 * that can be deleted from the history (older imports of the same week were replaced, removed ones are gone).
 *
 * `log` is newest first, as the service returns it.
 */
export function liveImportIds(log: ImportLogEntry[], weeks: ImportedWeek[]): Set<string> {
  const stored = new Map(weeks.map((w) => [w.meetingDate, w]));
  const decided = new Set<string>();
  const live = new Set<string>();
  for (const e of log) {
    const kinds: Array<'palms' | 'sponsor'> = e.kind === 'both' ? ['palms', 'sponsor'] : [e.kind];
    for (const kind of kinds) {
      const key = `${kind}|${e.meetingDate}`;
      if (decided.has(key)) continue;
      decided.add(key);
      if (e.action !== 'import') continue;
      const week = stored.get(e.meetingDate);
      if (week && (kind === 'palms' ? week.hasPalms : week.hasSponsorReport)) live.add(e.id);
    }
  }
  return live;
}
