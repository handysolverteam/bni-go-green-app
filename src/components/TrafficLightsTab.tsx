import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, FileSpreadsheet, FileText, Download, Filter, Loader2, Search, TrafficCone, Upload, X } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { GlassCard } from './GlassCard';
import { TrafficLightsImport } from './TrafficLightsImport';
import { TrafficLightsSetupError, trafficLightsService } from '../services/trafficLightsService';
import type { ImportLogEntry, PalmsWeekRecord, SponsorWeekRecord } from '../lib/trafficLights/types';
import { LIGHT_LABEL, type LightColor } from '../lib/trafficLights/score';
import { CUSTOM_RANGE, buildTrafficView, LAST_6_MONTHS } from '../lib/trafficLights/window';
import { downloadCsv, downloadPdf, downloadXlsx, safeFilePart } from '../lib/trafficLights/export';

interface Props {
  orgId: string;
  userId: string | null;
  userName: string | null;
  /** Names the chapter is known by (chapter_name, name) — also used in the export title. */
  orgNames: Array<string | null | undefined>;
  /** Owner / Admin: may import and remove weeks. Everyone else only views. */
  canImport: boolean;
}

const LIGHTS: LightColor[] = ['green', 'amber', 'red', 'grey'];
const DOT: Record<LightColor, string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', grey: 'bg-slate-400' };
const TEXT: Record<LightColor, string> = { green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', grey: 'text-slate-400' };

// One colour per metric (its header and its two columns), like the BNI sheet.
const GROUPS = [
  { key: 'att', label: 'Attendance', head: 'bg-blue-600', sub: 'bg-blue-600/80', cell: 'bg-blue-500/10' },
  { key: 'ceu', label: 'CEU', head: 'bg-teal-600', sub: 'bg-teal-600/80', cell: 'bg-teal-500/10' },
  { key: 'oto', label: '121', head: 'bg-violet-600', sub: 'bg-violet-600/80', cell: 'bg-violet-500/10' },
  { key: 'ref', label: 'Referrals Given', head: 'bg-green-600', sub: 'bg-green-600/80', cell: 'bg-green-500/10' },
  { key: 'tyf', label: 'TYFCB', head: 'bg-amber-600', sub: 'bg-amber-600/80', cell: 'bg-amber-500/10' },
  { key: 'vis', label: 'Visitors', head: 'bg-pink-600', sub: 'bg-pink-600/80', cell: 'bg-pink-500/10' },
  { key: 'spo', label: 'Sponsors', head: 'bg-sky-600', sub: 'bg-sky-600/80', cell: 'bg-sky-500/10' },
] as const;
const SUB_HEADS = ['Rate', 'Score', 'Rate', 'Score', 'Rate', 'Score', 'Rate', 'Score', 'Amount', 'Score', 'Count', 'Score', 'Count', 'Score'];

// Rates show up to 4 decimals, trailing zeros trimmed — exactly like BNI's sheet.
const dec4 = (r: number): string => String(Math.round(r * 10000) / 10000);
const rupees = (v: number): string => (v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—');

/**
 * Filter in the Name column header: a search box and a checklist of the members in the window. Checked members are the
 * only rows shown (none checked = everybody). The panel is a portal so the table's horizontal scroll cannot clip it.
 */
const NameFilter: React.FC<{ options: string[]; selected: string[]; onChange: (names: string[]) => void }> = ({ options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => o.toLowerCase().includes(needle));
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  return (
    <>
      <button
        ref={button}
        type="button"
        title="Filter members"
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) });
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 font-black"
      >
        Name <Filter className="w-3 h-3 opacity-80" />
        {selected.length > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[10px]">{selected.length}</span>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div className="fixed z-[61] w-64 space-y-2 rounded-xl border border-white/10 bg-slate-900 p-3 shadow-2xl" style={{ top: pos.top, left: pos.left }}>
              <span className="relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search a member…"
                  className="w-full rounded-lg border border-white/10 bg-slate-950/60 pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
              </span>
              <div className="max-h-60 space-y-0.5 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-400">No member matches.</p>
                ) : (
                  shown.map((n) => (
                    <label key={n} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-white/5">
                      <input type="checkbox" checked={selected.includes(n)} onChange={() => toggle(n)} className="accent-emerald-500" />
                      <span className="truncate">{n}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between pt-1 text-xs font-bold">
                <button type="button" disabled={selected.length === 0} onClick={() => onChange([])} className="text-slate-400 hover:text-white disabled:opacity-40">
                  Clear
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-emerald-400 hover:text-emerald-300">
                  Done
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
};

export const TrafficLightsTab: React.FC<Props> = ({ orgId, userId, userName, orgNames, canImport }) => {
  const [palms, setPalms] = useState<PalmsWeekRecord[]>([]);
  const [sponsors, setSponsors] = useState<SponsorWeekRecord[]>([]);
  const [log, setLog] = useState<ImportLogEntry[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [choice, setChoice] = useState(LAST_6_MONTHS);
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [light, setLight] = useState<LightColor | ''>('');
  const [names, setNames] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, history] = await Promise.all([trafficLightsService.fetchWeeks(orgId), trafficLightsService.fetchImportLog(orgId).catch(() => [])]);
      setPalms(data.palms);
      setSponsors(data.sponsors);
      setLog(history);
      setNeedsSetup(false);
    } catch (e) {
      if (e instanceof TrafficLightsSetupError) setNeedsSetup(true);
      else setError(e instanceof Error ? e.message : 'Could not load Traffic Lights.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const view = useMemo(
    () => buildTrafficView({ palms, sponsors, choice, custom: custom.from && custom.to ? custom : undefined }),
    [palms, sponsors, choice, custom],
  );

  // The calendars only offer dates that can hold imported data.
  const bounds = useMemo(() => {
    const weeks = view.weeks.filter((w) => w.hasPalms);
    return {
      min: weeks.reduce((m, w) => (m === '' || w.weekFrom < m ? w.weekFrom : m), ''),
      max: weeks.reduce((m, w) => (w.weekTo > m ? w.weekTo : m), ''),
    };
  }, [view.weeks]);

  // Picking a date in either calendar switches to that custom range (a reversed pair is swapped).
  const setRange = (from: string, to: string) => {
    if (!from || !to) return;
    setCustom(from <= to ? { from, to } : { from: to, to: from });
    setChoice(CUSTOM_RANGE);
  };

  const counts = useMemo(() => {
    const c: Record<LightColor, number> = { green: 0, amber: 0, red: 0, grey: 0 };
    for (const r of view.rows) c[r.color] += 1;
    return c;
  }, [view.rows]);

  const nameOptions = useMemo(() => view.rows.map((r) => r.name).sort((a, b) => a.localeCompare(b)), [view.rows]);
  const rows = useMemo(
    () => view.rows.filter((r) => (!light || r.color === light) && (names.length === 0 || names.includes(r.name))),
    [view.rows, light, names],
  );
  const filtered = light !== '' || names.length > 0;

  const chapter = (orgNames.find(Boolean) ?? 'Chapter').replace(/^bni\s+/i, '');
  const exportTitle = `MEMBER TRAFFIC LIGHTS OF ${chapter.toUpperCase()} CHAPTER`;
  const exportName = `traffic-lights-${safeFilePart(view.label)}${light ? `-${light}` : ''}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Traffic Lights…
      </div>
    );
  }

  if (needsSetup || error) {
    return (
      <GlassCard className="max-w-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-200">
            {needsSetup
              ? 'Traffic Lights is not set up yet: run supabase/migrations/014_traffic_lights.sql in the Supabase SQL editor, then reload.'
              : error}
          </div>
        </div>
      </GlassCard>
    );
  }

  const exportButtons =
    view.rows.length > 0 ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => downloadXlsx(rows, exportTitle, view.label, exportName)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-200 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> XLSX
        </button>
        <button
          type="button"
          onClick={() => downloadCsv(rows, exportTitle, view.label, exportName)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-200 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => {
            setPdfBusy(true);
            downloadPdf(rows, exportTitle, view.label, exportName)
              .catch(() => undefined)
              .finally(() => setPdfBusy(false));
          }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-200 hover:text-emerald-400 hover:border-emerald-500/40 disabled:opacity-60 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> {pdfBusy ? "Preparing…" : "PDF"}
        </button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<TrafficCone className="w-5 h-5" />}
        title={
          <span className="flex items-center gap-2">
            Traffic Lights
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-slate-300">{rows.length} member(s)</span>
          </span>
        }
        right={exportButtons}
      />
      <p className="text-xs text-slate-400 -mt-3">{view.label} — scored out of 100 from BNI&apos;s weekly PALMS and Sponsor reports.</p>

      {canImport && (
        <div>
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300"
          >
            <Upload className="w-3.5 h-3.5" /> Import weekly BNI reports
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${importOpen ? 'rotate-180' : ''}`} />
          </button>
          {(importOpen || view.weeks.length === 0) && (
            <div className="mt-3">
              <TrafficLightsImport orgId={orgId} userId={userId} userName={userName} log={log} orgNames={orgNames} weeks={view.weeks} onChanged={() => void load()} />
            </div>
          )}
        </div>
      )}

      {view.weeks.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-slate-300">
            {canImport
              ? 'No weeks imported yet — import the Chapter Summary PALMS Report and the Chapter Sponsor Report above.'
              : 'No Traffic Lights have been imported yet. Ask an Admin of your chapter to import the weekly BNI reports.'}
          </p>
        </GlassCard>
      ) : (
        <>
          <GlassCard className="space-y-3 !p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-400">
                Window
                <select
                  value={view.choice}
                  onChange={(e) => (e.target.value === CUSTOM_RANGE ? setRange(view.from, view.to) : setChoice(e.target.value))}
                  className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-bold text-white min-w-[210px]"
                >
                  {view.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {/* Calendars always show the window in use; picking a date turns it into a custom range. */}
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-400">
                From
                <input
                  type="date"
                  value={view.from}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(e) => e.target.value && setRange(e.target.value, view.to)}
                  className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-white [color-scheme:dark]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-400">
                To
                <input
                  type="date"
                  value={view.to}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(e) => e.target.value && setRange(view.from, e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-white [color-scheme:dark]"
                />
              </label>
              {view.choice === CUSTOM_RANGE && (
                <button
                  type="button"
                  onClick={() => setChoice(LAST_6_MONTHS)}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
                >
                  Reset to last 6 months
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLight('')}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${light === '' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-white/10 text-slate-300 hover:border-white/30'}`}
              >
                All <b>{view.rows.length}</b>
              </button>
              {LIGHTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLight(light === c ? '' : c)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${light === c ? 'border-emerald-500 bg-emerald-500/15 text-white' : 'border-white/10 text-slate-300 hover:border-white/30'}`}
                >
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[c]}`} /> {LIGHT_LABEL[c]} <b>{counts[c]}</b>
                </button>
              ))}
              <span className="text-[11px] text-slate-400 ml-1">
                <b className={TEXT.green}>Green</b> ≥ 70 · <b className={TEXT.amber}>Amber</b> 50–69 · <b className={TEXT.red}>Red</b> 30–49 ·{' '}
                <b className={TEXT.grey}>Grey</b> &lt; 30
              </span>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setLight('');
                    setNames([]);
                  }}
                  className="ml-auto flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
            </div>
          </GlassCard>

          {view.sponsorWeeksMissing > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
              The Sponsor Report is missing for {view.sponsorWeeksMissing} of the {view.meetings} weeks in this window, so sponsors may be
              undercounted — import it for those weeks.
            </div>
          )}

          {view.empty ? (
            <GlassCard>
              <p className="text-sm text-slate-300">No imported week falls inside this window.</p>
            </GlassCard>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead>
                    <tr className="text-white">
                      <th rowSpan={2} className="sticky left-0 z-30 w-12 min-w-[3rem] max-w-[3rem] bg-orange-600 px-1 py-2 text-center font-black">
                        Sr. No.
                      </th>
                      <th rowSpan={2} className="sticky left-12 z-30 min-w-[190px] bg-orange-600 px-3 py-2 text-left shadow-[2px_0_0_0_rgba(255,255,255,0.18)]">
                        <NameFilter options={nameOptions} selected={names} onChange={setNames} />
                      </th>
                      <th rowSpan={2} className="bg-orange-600 px-3 py-2 text-center font-black">
                        Total Score
                      </th>
                      {GROUPS.map((g) => (
                        <th key={g.key} colSpan={2} className={`${g.head} px-3 py-2 text-center font-black`}>
                          {g.label}
                        </th>
                      ))}
                    </tr>
                    <tr className="text-white/90">
                      {SUB_HEADS.map((h, i) => (
                        <th key={i} className={`${GROUPS[Math.floor(i / 2)].sub} px-3 py-1.5 text-center font-bold`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="px-3 py-6 text-center text-slate-400">
                          No member matches these filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => {
                        const cells: (string | number)[] = [
                          r.attendance.rate === null ? '—' : dec4(r.attendance.rate),
                          r.attendance.score,
                          dec4(r.ceu.rate),
                          r.ceu.score,
                          dec4(r.oneToOne.rate),
                          r.oneToOne.score,
                          dec4(r.referrals.rate),
                          r.referrals.score,
                          rupees(r.tyfcb.amount),
                          r.tyfcb.score,
                          r.visitors.count,
                          r.visitors.score,
                          r.sponsors.count,
                          r.sponsors.score,
                        ];
                        return (
                          <tr key={r.name} className="group border-t border-white/5 text-slate-200 hover:bg-white/5">
                            <td className="sticky left-0 z-10 w-12 min-w-[3rem] max-w-[3rem] bg-slate-900 px-1 py-2 text-center text-slate-400 group-hover:bg-slate-800">{i + 1}</td>
                            <td className="sticky left-12 z-10 min-w-[190px] bg-slate-900 px-3 py-2 font-bold text-white whitespace-nowrap shadow-[2px_0_0_0_rgba(255,255,255,0.08)] group-hover:bg-slate-800">
                              {r.name}
                              {r.notes.length > 0 && (
                                <span className="ml-1 cursor-help text-slate-400" title={r.notes.join('\n')}>
                                  ⓘ
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${DOT[r.color]}`} title={LIGHT_LABEL[r.color]} />
                              <b className="text-white">{r.total}</b>
                            </td>
                            {cells.map((c, ci) => (
                              <td key={ci} className={`${GROUPS[Math.floor(ci / 2)].cell} px-3 py-2 text-center whitespace-nowrap`}>
                                {c}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
