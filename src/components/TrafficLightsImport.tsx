import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Trash2, Upload, Loader2, X } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { prepareTrafficReport, type PreparedReport } from '../lib/trafficLights/import';
import type { ImportedWeek, ImportLogEntry } from '../lib/trafficLights/types';
import { liveImportIds } from '../lib/trafficLights/history';
import { rangeLabel, type WeekRange } from '../lib/trafficLights/weeks';
import { trafficLightsService } from '../services/trafficLightsService';

interface Props {
  orgId: string;
  userId: string | null;
  userName: string | null;
  /** Import history, newest first; null when migration 015 has not been run. */
  log: ImportLogEntry[] | null;
  /** Names the chapter is known by (chapter_name, name): a report for another chapter is refused. */
  orgNames: Array<string | null | undefined>;
  weeks: ImportedWeek[];
  onChanged: () => void;
}

/** A file the admin picked: its text is kept so the checks can be re-run when another file is deselected. */
type Picked = { id: number; name: string; /** null = not an .xls file */ text: string | null };
type Item = { id: number; filename: string; error?: string; report?: PreparedReport };

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Admin-only import of BNI's two weekly exports: the Chapter Summary PALMS Report and the Chapter Sponsor Report
 * (.xls, one week each — pick both files at once). Importing the same week again replaces it. Also lists the imported
 * weeks with a Remove button.
 */
export const TrafficLightsImport: React.FC<Props> = ({ orgId, userId, userName, log, orgNames, weeks, onChanged }) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const nextId = useRef(0);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<ImportedWeek | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [deleting, setDeleting] = useState<ImportLogEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const live = log ? liveImportIds(log, weeks) : new Set<string>();
  /** The file the week's data in use came from (null when the history does not know it). */
  const fileOf = (kind: 'palms' | 'sponsor', w: ImportedWeek): string | null =>
    log?.find((e) => live.has(e.id) && e.kind === kind && e.weekFrom === w.weekFrom && e.weekTo === w.weekTo)?.filename ?? null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setReading(true);
    const added: Picked[] = [];
    for (const file of Array.from(files)) {
      added.push({ id: nextId.current++, name: file.name, text: /\.xls$/i.test(file.name) ? await file.text() : null });
    }
    setPicked((prev) => [...prev, ...added]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Every selected file is checked against the imported weeks and against the files before it in the selection. The
  // checks re-run whenever a file is deselected (a file refused only because of an overlap may then be fine).
  const orgKey = orgNames.join('|');
  const items = useMemo<Item[]>(() => {
    const existingPalms: WeekRange[] = weeks.filter((w) => w.hasPalms).map((w) => ({ from: w.weekFrom, to: w.weekTo }));
    const existingSponsors: WeekRange[] = weeks.filter((w) => w.hasSponsorReport).map((w) => ({ from: w.weekFrom, to: w.weekTo }));
    const seen = new Map<string, string>();
    return picked.map((f): Item => {
      if (f.text === null) return { id: f.id, filename: f.name, error: `${f.name}: only the .xls files exported from BNI are supported.` };
      const result = prepareTrafficReport(f.name, f.text, { orgNames, existingPalms, existingSponsors });
      if (!result.ok) return { id: f.id, filename: f.name, error: result.error };
      const { kind, from, to } = result.report;
      const key = `${kind}|${from}|${to}`;
      const other = seen.get(key);
      if (other) {
        return {
          id: f.id,
          filename: f.name,
          error: `${f.name}: the same ${kind === 'palms' ? 'PALMS' : 'Sponsor'} week as ${other} is already selected — deselect one of them.`,
        };
      }
      seen.set(key, f.name);
      (kind === 'palms' ? existingPalms : existingSponsors).push({ from, to });
      return { id: f.id, filename: f.name, report: result.report };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, weeks, orgKey]);

  const deselect = (id: number) => setPicked((prev) => prev.filter((f) => f.id !== id));

  const ready = items.filter((i) => i.report);

  const runImport = async () => {
    setImporting(true);
    let done = 0;
    try {
      for (const item of ready) {
        await trafficLightsService.importReport(orgId, { userId, userName }, item.report as PreparedReport);
        done++;
      }
      showToast(`${done} report${done === 1 ? '' : 's'} imported.`, 'success');
      setPicked([]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import failed.', 'error');
    } finally {
      setImporting(false);
      onChanged();
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await trafficLightsService.deleteWeek(orgId, removing.weekFrom, removing.weekTo, { userId, userName }, removing.meetingDate);
      showToast('Week removed.', 'success');
      setRemoving(null);
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not remove the week.', 'error');
    } finally {
      setRemoveBusy(false);
    }
  };

  const confirmDeleteFile = async () => {
    if (!deleting || deleting.kind === 'both') return;
    setDeleteBusy(true);
    try {
      await trafficLightsService.deleteReport(orgId, deleting.kind, deleting.weekFrom, deleting.weekTo, { userId, userName }, deleting.meetingDate, deleting.filename);
      showToast('File data deleted. You can import the file again.', 'success');
      setDeleting(null);
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete the file data.', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <GlassCard className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-white">Import weekly BNI reports</h2>
        <p className="text-xs text-slate-400 mt-1">
          Upload the <b>Chapter Summary PALMS Report</b> and the <b>Chapter Sponsor Report</b> (.xls) for one week — both files at once is
          fine. Importing the same week again replaces it. Weeks add up, so the last 6 months, any range or a single week can be shown.
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-dashed border-white/20 bg-slate-900/40 px-4 py-3 cursor-pointer hover:border-emerald-500/50 transition-colors">
        <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs text-slate-300">Choose the PALMS and Sponsor report files…</span>
        <input ref={inputRef} type="file" accept=".xls" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      </label>
      {reading && (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading files…
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) =>
            item.report ? (
              <div key={item.id} className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[11px] text-emerald-300/80" title={item.filename}>
                    {item.filename}
                  </span>
                  <b>{item.report.kind === 'palms' ? 'PALMS report' : 'Sponsor report'}</b> · {rangeLabel(item.report.from, item.report.to)} · meeting{' '}
                  {rangeLabel(item.report.meetingDate, item.report.meetingDate)} ·{' '}
                  {item.report.kind === 'palms' ? `${item.report.rows.length} members` : `${item.report.rows.length} sponsored`}
                  {item.report.replaces ? ' · replaces the week already imported' : ''}
                </span>
                <button
                  type="button"
                  title="Deselect this file"
                  disabled={importing}
                  onClick={() => deselect(item.id)}
                  className="p-1 rounded-lg text-emerald-300/70 hover:text-white hover:bg-white/10 disabled:opacity-40 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div key={item.id} className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                <span className="flex-1 min-w-0">{item.error}</span>
                <button
                  type="button"
                  title="Deselect this file"
                  disabled={importing}
                  onClick={() => deselect(item.id)}
                  className="p-1 rounded-lg text-rose-300/70 hover:text-white hover:bg-white/10 disabled:opacity-40 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          )}
          <button
            type="button"
            disabled={importing}
            onClick={() => setPicked([])}
            className="text-[11px] font-bold text-slate-400 hover:text-white disabled:opacity-40"
          >
            Clear selection
          </button>
          {ready.length > 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={() => void runImport()}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors"
            >
              {importing ? 'Importing…' : `Import ${ready.length} report${ready.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {weeks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3 font-bold">Week</th>
                <th className="py-2 pr-3 font-bold">Meeting</th>
                <th className="py-2 pr-3 font-bold">PALMS report</th>
                <th className="py-2 pr-3 font-bold">Sponsor report</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w) => (
                <tr key={`${w.weekFrom}|${w.weekTo}`} className="border-b border-white/5 text-slate-200">
                  <td className="py-2 pr-3">{rangeLabel(w.weekFrom, w.weekTo)}</td>
                  <td className="py-2 pr-3">{rangeLabel(w.meetingDate, w.meetingDate)}</td>
                  <td className="py-2 pr-3">
                    {w.hasPalms ? `${w.members} members` : <span className="text-amber-400">not imported</span>}
                    {w.hasPalms && <span className="block max-w-[260px] truncate text-[10px] text-slate-500" title={fileOf('palms', w) ?? undefined}>{fileOf('palms', w) ?? 'file name not recorded'}</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {w.hasSponsorReport ? `${w.sponsored} sponsored` : <span className="text-amber-400">not imported (sponsors count 0)</span>}
                    {w.hasSponsorReport && <span className="block max-w-[260px] truncate text-[10px] text-slate-500" title={fileOf('sponsor', w) ?? undefined}>{fileOf('sponsor', w) ?? 'file name not recorded'}</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      title="Remove this week"
                      onClick={() => setRemoving(w)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-black text-white">Import history</h3>
        {log === null ? (
          <p className="text-xs text-amber-400">History is not recorded yet: run supabase/migrations/015_traffic_import_log.sql in the Supabase SQL editor.</p>
        ) : log.length === 0 ? (
          <p className="text-xs text-slate-400">No imports recorded yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900/90">
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-3 font-bold">When</th>
                  <th className="py-2 pr-3 font-bold">Action</th>
                  <th className="py-2 pr-3 font-bold">Report</th>
                  <th className="py-2 pr-3 font-bold">Week</th>
                  <th className="py-2 pr-3 font-bold">File</th>
                  <th className="py-2 pr-3 font-bold">Rows</th>
                  <th className="py-2 pr-3 font-bold">By</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 text-slate-200">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(e.at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {e.action === 'remove' ? <span className="text-rose-400">Deleted</span> : e.replaced ? <span className="text-amber-400">Re-imported</span> : 'Imported'}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.kind === 'palms' ? 'PALMS' : e.kind === 'sponsor' ? 'Sponsor' : 'PALMS + Sponsor'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{rangeLabel(e.weekFrom, e.weekTo)}</td>
                    <td className="py-2 pr-3 max-w-[260px] truncate" title={e.filename ?? undefined}>
                      {e.filename ?? <span className="text-slate-500">{e.action === 'remove' ? '—' : 'before history was kept'}</span>}
                    </td>
                    <td className="py-2 pr-3">{e.action === 'remove' ? '—' : e.rows}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {e.importedByName ?? (e.importedBy ? <span className="text-slate-500">user {e.importedBy.slice(0, 6)}…</span> : <span className="text-slate-500">—</span>)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {e.action === 'remove' ? <span className="text-slate-500">—</span> : live.has(e.id) ? <span className="text-emerald-400">In use</span> : <span className="text-slate-500">Not in use</span>}
                    </td>
                    <td className="py-2 text-right">
                      {live.has(e.id) && (
                        <button
                          type="button"
                          title="Delete this file's data (you can import it again)"
                          onClick={() => setDeleting(e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleting !== null}
        type="delete"
        title="Delete this file's data?"
        message={
          deleting
            ? `Delete the ${deleting.kind === 'palms' ? 'PALMS' : 'Sponsor'} report ${deleting.filename ? '"' + deleting.filename + '" ' : ''}of ${rangeLabel(deleting.weekFrom, deleting.weekTo)}? Its rows are removed from Traffic Lights. You can import the file again afterwards.`
            : ''
        }
        confirmText="Delete"
        isLoading={deleteBusy}
        onConfirm={() => void confirmDeleteFile()}
        onClose={() => setDeleting(null)}
      />

      <ConfirmationModal
        isOpen={removing !== null}
        type="delete"
        title="Remove this week?"
        message={removing ? `Remove the PALMS and Sponsor reports of ${rangeLabel(removing.weekFrom, removing.weekTo)}? The Traffic Lights screen will no longer include this week.` : ''}
        confirmText="Remove"
        isLoading={removeBusy}
        onConfirm={() => void confirmRemove()}
        onClose={() => setRemoving(null)}
      />
    </GlassCard>
  );
};
