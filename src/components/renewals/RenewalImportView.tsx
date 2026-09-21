import React, { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { renewalsService, type ImportResultLike } from '../../services/renewalsService';
import type { PalmsBatchImportResult } from '../../services/renewalsTypes';
import { formatDisplayDate, formatDisplayMonth } from '../../lib/renewals/date-format';
import { parsePalmsChapterSummaryReport } from '../../lib/renewals/palms-import';
import { isExactMonthlyPalmsWindow } from '../../lib/renewals/palms-monthly-performance';

/**
 * Import forms for the Renewals feature, ported from bni-rrc's
 * components/ImportForm.tsx — the piece that actually lets users get real
 * data into the renewals schema (previously the UI was read/write on
 * existing rows only, with no way to create any). Rebuilt in Handychapter's
 * own dark theme rather than a literal port, same approach as the rest of
 * this feature (see docs/BNI_RRC_MIGRATION.md).
 */

function ResultFeedback({ result, error }: { result: ImportResultLike | null; error: string | null }) {
  if (!result && !error) return null;
  return (
    <div className="space-y-2">
      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Imported {result.importedCount}, skipped {result.skippedCount}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-rose-300 space-y-0.5">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

const ImportCard: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
    <div>
      <h4 className="text-sm font-bold text-white">{title}</h4>
      <p className="mt-0.5 text-xs text-slate-400">{description}</p>
    </div>
    {children}
  </div>
);

const DropZone: React.FC<{
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList) => void;
}> = ({ label, accept, multiple, onFiles }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
        isDragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/15 bg-slate-950/40 hover:border-emerald-500/40'
      }`}
    >
      <Upload className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
      <p className="text-xs font-semibold text-slate-300">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};

const SingleFileImportForm: React.FC<{
  title: string;
  description: string;
  accept: string;
  showMonthField?: boolean;
  onImport: (file: File, reportMonth?: string) => Promise<ImportResultLike>;
  onImported: () => void;
}> = ({ title, description, accept, showMonthField, onImport, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResultLike | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await onImport(file, reportMonth || undefined);
      setResult(res);
      setFile(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImportCard title={title} description={description}>
      {file ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate rounded-lg bg-slate-950/40 border border-white/5 px-3 py-2 text-xs text-slate-300">
            {file.name}
          </span>
          <button type="button" onClick={() => setFile(null)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <DropZone label={`Drop ${accept} file or click to browse`} accept={accept} onFiles={(files) => setFile(files[0])} />
      )}

      {showMonthField && (
        <input
          type="month"
          value={reportMonth}
          onChange={(e) => setReportMonth(e.target.value)}
          placeholder="Report month (optional)"
          className="glass-input w-full rounded-lg text-xs px-3 py-2"
        />
      )}

      <button
        type="button"
        disabled={!file || submitting}
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold py-2 transition-all"
      >
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {submitting ? 'Importing…' : 'Import'}
      </button>

      <ResultFeedback result={result} error={error} />
    </ImportCard>
  );
};

type QueuedPalmsFile = {
  id: string;
  file: File;
  chapterName: string | null;
  reportFrom: string | null;
  reportTo: string | null;
  previewError: string | null;
};

const PalmsImportForm: React.FC<{
  mode: 'monthly' | 'lifetime';
  onImport: (files: File[]) => Promise<PalmsBatchImportResult>;
  onImported: () => void;
}> = ({ mode, onImport, onImported }) => {
  const [queued, setQueued] = useState<QueuedPalmsFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PalmsBatchImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queueFiles = async (files: FileList) => {
    const parsed = await Promise.all(
      Array.from(files).map(async (file) => {
        try {
          const report = parsePalmsChapterSummaryReport(await file.text());
          const isMonthly =
            report.reportFrom && report.reportTo
              ? isExactMonthlyPalmsWindow({ report_from: report.reportFrom, report_to: report.reportTo })
              : false;
          const previewError =
            mode === 'monthly'
              ? isMonthly
                ? null
                : 'This PALMS file is not a single calendar month.'
              : isMonthly
                ? 'This is a monthly PALMS file — use the monthly upload instead.'
                : null;
          return {
            id: `${file.name}-${file.lastModified}`,
            file,
            chapterName: report.chapterName,
            reportFrom: report.reportFrom,
            reportTo: report.reportTo,
            previewError,
          } satisfies QueuedPalmsFile;
        } catch (err) {
          return {
            id: `${file.name}-${file.lastModified}`,
            file,
            chapterName: null,
            reportFrom: null,
            reportTo: null,
            previewError: err instanceof Error ? err.message : 'Could not read file.',
          } satisfies QueuedPalmsFile;
        }
      }),
    );

    setQueued((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      parsed.forEach((item) => byId.set(item.id, item));
      return [...byId.values()];
    });
  };

  const hasInvalid = queued.some((item) => item.previewError !== null);

  const handleSubmit = async () => {
    if (queued.length === 0 || hasInvalid) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await onImport(queued.map((item) => item.file));
      setResult(res);
      setQueued([]);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImportCard
      title={mode === 'monthly' ? 'PALMS Monthly Chapter Summaries' : 'PALMS Lifetime Chapter Summary'}
      description={
        mode === 'monthly'
          ? 'One or many monthly PALMS chapter summaries (.xls). Duplicates are skipped automatically.'
          : 'Broad-range PALMS chapter summaries (.xls) for lifetime achievement totals.'
      }
    >
      <DropZone label="Drop .xls files or click to browse (multiple allowed)" accept=".xls" multiple onFiles={queueFiles} />

      {queued.length > 0 && (
        <div className="space-y-1.5">
          {queued.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                item.previewError ? 'border-rose-500/30 bg-rose-500/5' : 'border-white/5 bg-slate-950/40'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-200">{item.file.name}</p>
                {item.previewError ? (
                  <p className="text-rose-400">{item.previewError}</p>
                ) : (
                  <p className="text-slate-500">
                    {item.chapterName ?? 'Unknown chapter'} &bull; {formatDisplayDate(item.reportFrom)} to{' '}
                    {formatDisplayDate(item.reportTo)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQueued((current) => current.filter((f) => f.id !== item.id))}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={queued.length === 0 || hasInvalid || submitting}
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold py-2 transition-all"
      >
        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {submitting ? 'Importing…' : `Import ${queued.length || ''} file${queued.length === 1 ? '' : 's'}`.trim()}
      </button>

      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs space-y-1">
          <p className="font-bold text-emerald-400">
            {result.importedFiles} imported, {result.duplicateFiles} duplicate, {result.failedFiles} failed
          </p>
          <p className="text-slate-400">
            {result.importedCount} rows imported, {result.skippedCount} skipped
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}
    </ImportCard>
  );
};

const PalmsCoveragePanel: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [coverage, setCoverage] = useState<{ uploadedMonths: { reportFrom: string; chapterName: string | null }[]; missingMonths: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    renewalsService
      .getPalmsCoverage()
      .then((data) => {
        if (!cancelled) setCoverage(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load coverage.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // refreshKey is bumped by RenewalImportView after every successful
    // import so this panel doesn't stay stale after a PALMS upload — it
    // previously only fetched once on mount.
  }, [refreshKey]);

  return (
    <ImportCard
      title="Monthly PALMS Coverage"
      description="Uploaded months, and months detected as missing in the range."
    >
      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading coverage…
        </p>
      )}
      {error && !loading && <p className="text-xs text-rose-400">{error}</p>}
      {coverage && !loading && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Uploaded</p>
            {coverage.uploadedMonths.length === 0 ? (
              <p className="text-xs text-slate-500">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {coverage.uploadedMonths.map((m) => (
                  <span key={`${m.chapterName}-${m.reportFrom}`} className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                    {formatDisplayMonth(m.reportFrom)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Missing</p>
            {coverage.missingMonths.length === 0 ? (
              <p className="text-xs text-slate-500">No gaps detected in the uploaded range.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {coverage.missingMonths.map((m) => (
                  <span key={m} className="rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
                    {formatDisplayMonth(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ImportCard>
  );
};

export const RenewalImportView: React.FC<{ onImported: () => void }> = ({ onImported }) => {
  // Bumped after every successful import (not just PALMS ones — harmless
  // to over-refresh) so PalmsCoveragePanel below re-fetches instead of
  // staying stuck on whatever it first loaded.
  const [coverageRefreshKey, setCoverageRefreshKey] = useState(0);

  const handleImported = () => {
    onImported();
    setCoverageRefreshKey((key) => key + 1);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SingleFileImportForm
        title="Membership Dues Report"
        description="Upload the dues .xls report to create/update members and their renewal cycles."
        accept=".xls"
        onImport={(file) => renewalsService.importMembershipDues(file)}
        onImported={handleImported}
      />

      <SingleFileImportForm
        title="Traffic Lights (PDF / XLSX)"
        description="Monthly Member Traffic Lights PDF or score-only XLSX. Month override is optional."
        accept=".pdf,.xlsx"
        showMonthField
        onImport={(file, reportMonth) => renewalsService.importTrafficLights(file, reportMonth)}
        onImported={handleImported}
      />

      <SingleFileImportForm
        title="Sponsor Report"
        description="Refreshes lifetime and past-year sponsor achievements for matched members."
        accept=".xls"
        onImport={(file) => renewalsService.importSponsors(file)}
        onImported={handleImported}
      />

      <SingleFileImportForm
        title="Training Report"
        description="Lifetime and past-year training attendance counts for matched members."
        accept=".xls"
        onImport={(file) => renewalsService.importTrainings(file)}
        onImported={handleImported}
      />

      <PalmsImportForm mode="monthly" onImport={(files) => renewalsService.importPalms(files)} onImported={handleImported} />
      <PalmsImportForm mode="lifetime" onImport={(files) => renewalsService.importPalmsLifetime(files)} onImported={handleImported} />

      <div className="lg:col-span-2">
        <PalmsCoveragePanel refreshKey={coverageRefreshKey} />
      </div>
    </div>
  );
};
