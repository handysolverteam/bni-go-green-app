import React from 'react';
import { formatDisplayMonth } from '../../lib/renewals/date-format';
import { sortTrafficLightHistoryForDisplay } from '../../lib/renewals/traffic-light-history';
import type { MemberTrafficLight, TrafficLightColor } from '../../lib/renewals/types';

// Handychapter's own navy/emerald palette standing in for bni-rrc's literal
// hex-coded dots (see docs/BNI_RRC_MIGRATION.md Phase 3 — translated to this
// app's design language rather than copied class-for-class).
export const trafficLightDotClasses: Record<TrafficLightColor, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-400',
  grey: 'bg-slate-500',
};

export function formatTrafficLightColor(color: TrafficLightColor): string {
  return color === 'grey' ? 'Grey' : `${color[0].toUpperCase()}${color.slice(1)}`;
}

export const TrafficLightBadge: React.FC<{ trafficLight: MemberTrafficLight; compact?: boolean }> = ({
  trafficLight,
  compact = false,
}) => (
  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
    <span className={`h-2.5 w-2.5 rounded-full ${trafficLightDotClasses[trafficLight.color]}`} />
    <span className="font-bold text-white">
      {formatTrafficLightColor(trafficLight.color)} {trafficLight.score}
    </span>
    {!compact && <span>{formatDisplayMonth(trafficLight.report_month)}</span>}
  </p>
);

export const TrafficLightTrend: React.FC<{ history: MemberTrafficLight[]; className?: string }> = ({
  history,
  className = '',
}) => {
  const displayHistory = sortTrafficLightHistoryForDisplay(history);

  if (displayHistory.length === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-label="Traffic light trend">
      {displayHistory.map((trafficLight) => (
        <span
          key={`${trafficLight.member_id}-${trafficLight.report_month}`}
          className={`h-2.5 w-2.5 rounded-full ${trafficLightDotClasses[trafficLight.color]}`}
          title={`${formatDisplayMonth(trafficLight.report_month)}: ${formatTrafficLightColor(trafficLight.color)} ${trafficLight.score}`}
        />
      ))}
    </div>
  );
};
