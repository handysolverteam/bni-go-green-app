import React, { useMemo, useState } from 'react';
import { getDefaultMobileStage, groupCyclesByStage } from '../../lib/renewals/stage-groups';
import type { DashboardCycle } from '../../lib/renewals/types';
import { RenewalMemberCard } from './RenewalMemberCard';

export const RenewalKanbanBoard: React.FC<{ cycles: DashboardCycle[]; onSelectMember: (memberId: string) => void }> = ({
  cycles,
  onSelectMember,
}) => {
  const groups = useMemo(() => groupCyclesByStage(cycles), [cycles]);
  const [activeStage, setActiveStage] = useState(() => getDefaultMobileStage(cycles));
  const activeGroup = groups.find((group) => group.stage === activeStage) ?? groups[0];

  return (
    <div className="space-y-4">
      {/* Mobile: stage-switcher pills + single column */}
      <div className="md:hidden -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {groups.map((group) => (
          <button
            key={group.stage}
            type="button"
            onClick={() => setActiveStage(group.stage)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
              group.stage === activeStage
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                : 'border-white/10 bg-slate-900/60 text-slate-400'
            }`}
          >
            {group.stage} <span className="ml-1 opacity-70">{group.cycles.length}</span>
          </button>
        ))}
      </div>

      <div className="md:hidden rounded-2xl border border-white/10 bg-slate-900/40 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{activeGroup.stage}</h3>
          <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
            {activeGroup.cycles.length}
          </span>
        </div>
        <div className="space-y-3">
          {activeGroup.cycles.map((cycle) => (
            <RenewalMemberCard key={cycle.id} cycle={cycle} onSelect={onSelectMember} />
          ))}
          {activeGroup.cycles.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
              No members here.
            </p>
          )}
        </div>
      </div>

      {/* Desktop: full multi-column board */}
      <div className="hidden md:grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {groups.map((group) => (
          <div key={group.stage} className="rounded-2xl border border-white/10 bg-slate-900/40 p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{group.stage}</h3>
              <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                {group.cycles.length}
              </span>
            </div>
            <div className="space-y-3">
              {group.cycles.map((cycle) => (
                <RenewalMemberCard key={cycle.id} cycle={cycle} onSelect={onSelectMember} />
              ))}
              {group.cycles.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                  No members here.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
