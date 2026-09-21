import React from 'react';
import { formatDisplayDate } from '../../lib/renewals/date-format';
import { getNextWorkflowTask } from '../../lib/renewals/task-inbox-model';
import { taskTypeLabels } from '../../lib/renewals/task-types';
import { getUrgency, type UrgencyColor } from '../../lib/renewals/urgency';
import type { DashboardCycle } from '../../lib/renewals/types';
import { TrafficLightBadge, TrafficLightTrend } from './TrafficLightBadge';

const accentBorderClasses: Record<UrgencyColor | 'neutral', string> = {
  red: 'border-l-rose-500',
  yellow: 'border-l-amber-500',
  green: 'border-l-emerald-500',
  neutral: 'border-l-white/10',
};

const dotClasses: Record<UrgencyColor, string> = {
  red: 'bg-rose-400',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-400',
};

function formatUrgencyLabel(label: 'overdue' | 'due_soon' | 'upcoming'): string {
  if (label === 'overdue') return 'Overdue';
  if (label === 'due_soon') return 'Due soon';
  return 'Upcoming';
}

export const RenewalMemberCard: React.FC<{ cycle: DashboardCycle; onSelect: (memberId: string) => void }> = ({
  cycle,
  onSelect,
}) => {
  const nextTask = getNextWorkflowTask(cycle.renewal_tasks);
  const urgency = nextTask ? getUrgency(nextTask.due_date) : null;
  const accentClass = urgency ? accentBorderClasses[urgency.color] : accentBorderClasses.neutral;

  return (
    <button
      type="button"
      onClick={() => onSelect(cycle.member.id)}
      className={`block w-full text-left rounded-xl border border-l-4 border-white/10 bg-slate-900/60 p-3.5 transition-all hover:border-emerald-500/40 hover:bg-slate-800/80 ${accentClass}`}
    >
      <div>
        <h3 className="text-sm font-bold text-white">{cycle.member.name}</h3>
        <p className="text-xs text-slate-400">{cycle.member.industry || 'No industry'}</p>
        {cycle.is_two_year_renewal && (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400">2-year renewal term</p>
        )}
      </div>

      {cycle.latest_traffic_light && (
        <div className="mt-3 space-y-1.5">
          <TrafficLightBadge trafficLight={cycle.latest_traffic_light} />
          <TrafficLightTrend history={cycle.traffic_light_history} />
        </div>
      )}

      {nextTask && urgency && (
        <div className="mt-3 space-y-0.5 text-xs">
          <p className="flex items-center gap-2 font-semibold text-slate-400">
            <span className={`h-2 w-2 rounded-full ${dotClasses[urgency.color]}`} />
            {formatUrgencyLabel(urgency.urgency_label)}
          </p>
          <p className="font-bold text-emerald-400">{taskTypeLabels[nextTask.task_type]}</p>
          <p className="text-slate-400">Due {formatDisplayDate(nextTask.due_date)}</p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Renewal {formatDisplayDate(cycle.renewal_date)} &bull; {cycle.open_task_count} open
      </p>
      {cycle.is_two_year_renewal && cycle.reported_due_date && (
        <p className="mt-0.5 text-[11px] text-slate-500">Reported due {formatDisplayDate(cycle.reported_due_date)}</p>
      )}
    </button>
  );
};
