import React, { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, ListChecks, Loader2, AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { renewalsService } from '../../services/renewalsService';
import type { DashboardCycle } from '../../lib/renewals/types';
import type { TaskInboxItem } from '../../lib/renewals/task-inbox-model';
import { RenewalKanbanBoard } from './RenewalKanbanBoard';
import { RenewalTaskInbox } from './RenewalTaskInbox';
import { RenewalMemberDetailModal } from './RenewalMemberDetailModal';
import { RenewalImportView } from './RenewalImportView';

type RenewalsView = 'kanban' | 'inbox' | 'import';

/**
 * New "Renewals" tab — Phase 3 of the bni-rrc -> Handychapter migration
 * (see docs/BNI_RRC_MIGRATION.md). Displays the renewal kanban and task
 * inbox ported from bni-rrc via the Phase 2 Edge Functions, with task
 * complete/cancel and renewal-status write actions wired up, plus the
 * Import view (membership dues / PALMS / sponsors / trainings / traffic
 * lights) so real data can actually be posted into Handychapter's own
 * Supabase project through the UI — the piece that was still missing after
 * the read-only + status-write views, since without it the Kanban/inbox
 * have no way to ever contain data for a fresh deployment.
 *
 * `initialView`: driven by the sidebar's "Import Data" entry (a second nav
 * item sharing the 'renewals' tab with a `subPath: 'import'`, see
 * Sidebar.tsx) so Import is reachable in one click, not two. Re-applied via
 * a useEffect (not just a useState initializer) since clicking that sidebar
 * entry while already on the Renewals tab doesn't remount this component —
 * only the prop value changes.
 */
export const RenewalsTab: React.FC<{ initialView?: RenewalsView }> = ({ initialView }) => {
  const { showToast } = useToast();
  const [view, setView] = useState<RenewalsView>(initialView ?? 'kanban');

  useEffect(() => {
    setView(initialView ?? 'kanban');
  }, [initialView]);
  const [cycles, setCycles] = useState<DashboardCycle[]>([]);
  const [tasks, setTasks] = useState<TaskInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [cyclesResult, tasksResult] = await Promise.all([
        renewalsService.getDashboardCycles(),
        renewalsService.getTaskInbox(),
      ]);
      setCycles(cyclesResult);
      setTasks(tasksResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load renewals data. The renewals schema/Edge Functions may not be deployed yet.',
      );
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData, refreshKey]);

  const handleUpdateTaskStatus = async (taskId: string, status: 'completed' | 'cancelled') => {
    try {
      await renewalsService.updateRenewalTaskStatus(taskId, status);
      showToast(`Task marked ${status}.`, 'success');
      await loadData(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update task.', 'error');
    }
  };

  const overdueCount = tasks.filter((t) => t.urgency_label === 'overdue').length;
  const dueSoonCount = tasks.filter((t) => t.urgency_label === 'due_soon').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Renewals</h1>
          <p className="text-xs text-slate-400">Membership renewal workflow, ported from bni-rrc</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh"
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-white/10 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                view === 'kanban' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setView('inbox')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                view === 'inbox' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" /> Task Inbox
              {(overdueCount > 0 || dueSoonCount > 0) && (
                <span className="ml-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black px-1.5">
                  {overdueCount + dueSoonCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setView('import')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                view === 'import' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" /> Import
            </button>
          </div>
        </div>
      </div>

      {view === 'import' && <RenewalImportView onImported={() => loadData(false)} />}

      {view !== 'import' && loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading renewals…
        </div>
      )}

      {view !== 'import' && error && !loading && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Couldn&apos;t load renewals data</p>
            <p className="mt-1 text-rose-300/80">{error}</p>
          </div>
        </div>
      )}

      {view !== 'import' && !loading && !error && cycles.length === 0 && tasks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
          <p className="text-sm font-bold text-white">No renewal data yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Use the <button type="button" onClick={() => setView('import')} className="text-emerald-400 font-bold hover:underline">Import</button> tab to upload a membership dues report and populate this view.
          </p>
        </div>
      )}

      {view !== 'import' && !loading && !error && (cycles.length > 0 || tasks.length > 0) && (
        <>
          {view === 'kanban' && <RenewalKanbanBoard cycles={cycles} onSelectMember={setSelectedMemberId} />}
          {view === 'inbox' && (
            <RenewalTaskInbox tasks={tasks} onSelectMember={setSelectedMemberId} onUpdateTaskStatus={handleUpdateTaskStatus} />
          )}
        </>
      )}

      {selectedMemberId && (
        <RenewalMemberDetailModal
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
          onCycleStatusChanged={() => loadData(false)}
        />
      )}
    </div>
  );
};
