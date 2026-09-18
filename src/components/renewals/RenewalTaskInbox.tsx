import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatDisplayDate } from '../../lib/renewals/date-format';
import { taskTypeLabels } from '../../lib/renewals/task-types';
import { groupInboxTasks, type TaskInboxItem } from '../../lib/renewals/task-inbox-model';
import type { UrgencyColor, UrgencyLabel } from '../../lib/renewals/urgency';

const indicatorClasses: Record<UrgencyColor, string> = {
  red: 'border-l-rose-500 bg-rose-500/5',
  yellow: 'border-l-amber-500 bg-amber-500/5',
  green: 'border-l-emerald-500 bg-slate-900/60',
};

const dotClasses: Record<UrgencyColor, string> = {
  red: 'bg-rose-400',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-400',
};

function formatUrgency(label: UrgencyLabel): string {
  if (label === 'overdue') return 'Overdue';
  if (label === 'due_soon') return 'Due soon';
  return 'Upcoming';
}

const sectionOrder = ['overdue', 'due_soon', 'upcoming'] as const;
const sectionLabels: Record<(typeof sectionOrder)[number], string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon (Next 10 Days)',
  upcoming: 'Upcoming',
};

export const RenewalTaskInbox: React.FC<{
  tasks: TaskInboxItem[];
  onSelectMember: (memberId: string) => void;
  onUpdateTaskStatus: (taskId: string, status: 'completed' | 'cancelled') => Promise<void>;
}> = ({ tasks, onSelectMember, onUpdateTaskStatus }) => {
  const groups = groupInboxTasks(tasks);
  const nextAction = tasks[0] ?? null;
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const handleUpdate = async (taskId: string, status: 'completed' | 'cancelled', event: React.MouseEvent) => {
    event.stopPropagation();
    setPendingTaskId(taskId);
    try {
      await onUpdateTaskStatus(taskId, status);
    } finally {
      setPendingTaskId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <p className="text-xs font-bold text-emerald-400">Next Action</p>
        {nextAction ? (
          <button
            type="button"
            onClick={() => onSelectMember(nextAction.member.id)}
            className="mt-1 block w-full text-left"
          >
            <span className="block text-base font-black text-white">
              {nextAction.member.name} &mdash; {taskTypeLabels[nextAction.task_type]}
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">Due {formatDisplayDate(nextAction.due_date)}</span>
          </button>
        ) : (
          <p className="mt-1 text-xs text-slate-500">No open tasks.</p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs font-bold text-slate-300">
          You have: <span className="text-rose-400">{groups.overdue.length} overdue</span>
          {'  '}
          <span className="text-amber-400">{groups.due_soon.length} due soon</span>
        </p>
      </div>

      <div className="space-y-5">
        {sectionOrder.map((key) => (
          <section key={key} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{sectionLabels[key]}</h3>
              <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                {groups[key].length}
              </span>
            </div>

            {groups[key].length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                No open tasks here.
              </p>
            ) : (
              <div className="space-y-2.5">
                {groups[key].map((task) => {
                  const isPending = pendingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectMember(task.member.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectMember(task.member.id);
                        }
                      }}
                      className={`w-full rounded-xl border border-l-4 border-white/10 p-3.5 text-left transition-all hover:border-emerald-500/40 cursor-pointer ${indicatorClasses[task.color]}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-label={formatUrgency(task.urgency_label)}
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses[task.color]}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">{task.member.name}</p>
                          <p className="text-xs font-semibold text-emerald-400">{taskTypeLabels[task.task_type]}</p>
                          <p className="mt-0.5 text-xs text-slate-400">Due {formatDisplayDate(task.due_date)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={(event) => handleUpdate(task.id, 'completed', event)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-all"
                        >
                          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Complete'}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={(event) => handleUpdate(task.id, 'cancelled', event)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};
