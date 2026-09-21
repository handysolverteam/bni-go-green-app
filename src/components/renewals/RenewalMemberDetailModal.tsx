import React, { useEffect, useState } from 'react';
import { UniversalModal } from '../UniversalModal';
import { useToast } from '../../context/ToastContext';
import { formatDisplayDate, formatDisplayMonth, formatTenure } from '../../lib/renewals/date-format';
import { sortTrafficLightHistoryForDisplay } from '../../lib/renewals/traffic-light-history';
import { taskTypeLabels } from '../../lib/renewals/task-types';
import { renewalsService } from '../../services/renewalsService';
import type { MemberDetail } from '../../services/renewalsTypes';
import type { RenewalStatus } from '../../lib/renewals/types';
import { TrafficLightBadge, TrafficLightTrend, formatTrafficLightColor } from './TrafficLightBadge';
import { User, Loader2, AlertTriangle } from 'lucide-react';

const statusOptions: RenewalStatus[] = ['active', 'renewed', 'dropped'];

export const RenewalMemberDetailModal: React.FC<{
  memberId: string;
  onClose: () => void;
  onCycleStatusChanged?: () => void;
}> = ({ memberId, onClose, onCycleStatusChanged }) => {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    renewalsService
      .getMemberDetail(memberId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load member detail.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const cycle = detail?.currentCycle ?? null;
  const trafficLightHistory = cycle ? sortTrafficLightHistoryForDisplay(cycle.traffic_light_history) : [];

  const handleStatusChange = async (newStatus: RenewalStatus) => {
    if (!cycle || newStatus === cycle.status) return;
    setSavingStatus(true);
    try {
      await renewalsService.updateRenewalCycleStatus(cycle.id, newStatus);
      setDetail((prev) => (prev && prev.currentCycle ? { ...prev, currentCycle: { ...prev.currentCycle, status: newStatus } } : prev));
      showToast(`Renewal status set to ${newStatus}.`, 'success');
      onCycleStatusChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update renewal status.', 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <UniversalModal
      isOpen
      onClose={onClose}
      title={detail?.member.name || 'Member Detail'}
      icon={<User className="w-4 h-4 text-emerald-400" />}
      maxWidth="max-w-3xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading member detail…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {detail && !loading && !error && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-400">{cycle?.stage ?? 'Not in active workflow'}</p>
                <p className="mt-1 text-xs text-slate-400">{detail.member.industry || 'No industry'}</p>
                {detail.member.report_role && <p className="text-xs text-slate-400">{detail.member.report_role}</p>}
                <p className="mt-1 text-[11px] text-slate-500">{formatTenure(detail.member.member_since)}</p>
              </div>

              {cycle && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {savingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                  <select
                    value={cycle.status}
                    disabled={savingStatus}
                    onChange={(e) => handleStatusChange(e.target.value as RenewalStatus)}
                    className="glass-input rounded-lg text-xs font-bold px-2.5 py-1.5 capitalize disabled:opacity-50"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status} className="capitalize">
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {cycle && (
              <div className="mt-3 rounded-lg bg-slate-950/40 border border-white/5 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Renewal date</p>
                <p className="mt-0.5 text-xl font-black text-emerald-400">{formatDisplayDate(cycle.renewal_date)}</p>
                {cycle.is_two_year_renewal && cycle.reported_due_date && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs">
                    <p className="font-bold text-emerald-400">2-year renewal term</p>
                    <p className="mt-0.5 text-slate-400">Reported due {formatDisplayDate(cycle.reported_due_date)}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {!cycle && (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
              No renewal cycles have been imported for this member yet.
            </p>
          )}

          {cycle && (
            <div className="grid gap-4 lg:grid-cols-2">
              {cycle.latest_traffic_light && (
                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  <h4 className="text-sm font-bold text-white">Traffic Light</h4>
                  <div className="mt-2">
                    <TrafficLightBadge trafficLight={cycle.latest_traffic_light} />
                  </div>
                  <TrafficLightTrend className="mt-2" history={cycle.traffic_light_history} />
                  {trafficLightHistory.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-500">
                            <th className="py-1.5 pr-3 font-semibold">Month</th>
                            <th className="py-1.5 pr-3 font-semibold">Score</th>
                            <th className="py-1.5 pr-3 font-semibold">Light</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trafficLightHistory.map((tl) => (
                            <tr key={`${tl.member_id}-${tl.report_month}`} className="border-b border-white/5 last:border-0">
                              <td className="py-1.5 pr-3 text-slate-300">{formatDisplayMonth(tl.report_month)}</td>
                              <td className="py-1.5 pr-3 text-slate-300">{tl.score}</td>
                              <td className="py-1.5 pr-3 text-slate-300">{formatTrafficLightColor(tl.color)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <h4 className="text-sm font-bold text-white">Renewal Dates</h4>
                <dl className="mt-2 space-y-1.5 text-xs">
                  {Object.entries(cycle.derived_dates).map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-slate-500 capitalize">{label.replace(/_/g, ' ')}</dt>
                      <dd className="text-slate-300 font-medium">{formatDisplayDate(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 lg:col-span-2">
                <h4 className="text-sm font-bold text-white">Open Tasks</h4>
                {cycle.renewal_tasks.filter((t) => t.status === 'open').length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No open tasks.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {cycle.renewal_tasks
                      .filter((t) => t.status === 'open')
                      .map((task) => (
                        <div key={task.id} className="flex items-center justify-between rounded-lg bg-slate-950/40 border border-white/5 px-3 py-2 text-xs">
                          <span className="font-semibold text-emerald-400">{taskTypeLabels[task.task_type]}</span>
                          <span className="text-slate-400">Due {formatDisplayDate(task.due_date)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(detail.sponsorSummary.lifetimeCount > 0 || detail.trainingSummary.lifetimeCount > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <h4 className="text-sm font-bold text-white">Sponsor Achievements</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {detail.sponsorSummary.lifetimeCount} lifetime &bull; {detail.sponsorSummary.pastYearCount} past year
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <h4 className="text-sm font-bold text-white">Training Achievements</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {detail.trainingSummary.lifetimeCount} lifetime &bull; {detail.trainingSummary.pastYearCount} past year
                </p>
              </div>
            </div>
          )}

          {detail.pastRoles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <h4 className="text-sm font-bold text-white">Past Roles</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.pastRoles.map((entry) => (
                  <span key={entry.id} className="rounded-lg bg-slate-950/40 border border-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                    {entry.role.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {detail.cycles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <h4 className="text-sm font-bold text-white">Renewal History</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-500">
                      <th className="py-1.5 pr-3 font-semibold">Year</th>
                      <th className="py-1.5 pr-3 font-semibold">Date</th>
                      <th className="py-1.5 pr-3 font-semibold">Status</th>
                      <th className="py-1.5 pr-3 font-semibold">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cycles.map((item) => (
                      <tr key={item.id} className="border-b border-white/5 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-300">{item.renewal_year}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{formatDisplayDate(item.renewal_date)}</td>
                        <td className="py-1.5 pr-3 text-slate-300 capitalize">{item.status}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{item.stage ?? 'Not in active workflow'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </UniversalModal>
  );
};
