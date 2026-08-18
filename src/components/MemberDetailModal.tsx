import React from 'react';
import { Member } from '../types';
import { levelUpPlan, formatCurrency, trafficLight } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { getWhatsAppUrl } from '../lib/whatsappUtils';
import { buildMemberTemplateData, substituteKeywords, UNIVERSAL_DEFAULT_TEMPLATE_TEXT, CAT_LABELS } from '../lib/outreachUtils';
import { X, Award, CheckCircle2, TrendingUp, Send, ExternalLink, ShieldCheck, User } from 'lucide-react';
import { UniversalModal } from './UniversalModal';

import { formatDecimal } from '../lib/numberUtils';

interface MemberDetailModalProps {
  isOpen: boolean;
  member: Member;
  onClose: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ isOpen, member, onClose }) => {
  const plan = levelUpPlan(member);

  const getWAUrl = () => {
    const dataDict = buildMemberTemplateData(member);
    const txt = substituteKeywords(UNIVERSAL_DEFAULT_TEMPLATE_TEXT, dataDict);
    return getWhatsAppUrl(member.Phone || '', txt);
  };

  const categories = [
    { key: 'attendance', label: 'Attendance Rate', value: `${formatDecimal((member.breakdown?.attendance?.value || 0) * 100, 1)}%`, targetKey: 'attendance_target' },
    { key: 'ceu', label: 'CEU (Trainings/wk)', value: formatDecimal(member.breakdown?.ceu?.value || 0, 1), targetKey: 'ceu_target' },
    { key: 'oneToOnes', label: '1-2-1 Meetings/wk', value: formatDecimal(member.breakdown?.oneToOnes?.value || 0, 1), targetKey: 'one_to_ones_target' },
    { key: 'referrals', label: 'Referrals Given/wk', value: formatDecimal(member.breakdown?.referrals?.value || 0, 1), targetKey: 'referrals_target' },
    { key: 'tyfcb', label: 'TYFCB Closed', value: formatCurrency(member.TYFCB || 0), targetKey: 'tyfcb_target' },
    { key: 'visitors', label: 'Visitors Brought', value: member.V || 0, targetKey: 'visitors_target' },
    { key: 'sponsors', label: 'Members Sponsored', value: member.Sponsors || 0, targetKey: 'sponsors_target' },
  ];

  const dataDict = buildMemberTemplateData(member);

  return (
    <UniversalModal
      isOpen={isOpen}
      onClose={onClose}
      title={member.Name}
      icon={<User className="w-5 h-5" />}
      maxWidth="max-w-3xl"
    >      <div className="space-y-4">
          {/* Level Up Plan */}
          <GlassCard glow className="p-3.5 sm:p-4 space-y-3 border-emerald-500/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Level-Up Goal Plan</span>
              </h3>
              {plan.to && (
                <span className="self-start sm:self-auto text-[11px] sm:text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 whitespace-normal">
                  Target: {plan.to} (+{plan.pointsNeeded} pts needed)
                </span>
              )}
            </div>

            {plan.stayGreen ? (
              <div className="flex items-start space-x-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Member is in GREEN zone! Recommended maintenance actions below:</span>
              </div>
            ) : (
              <p className="text-xs text-slate-300">
                To reach <strong className="text-white">{plan.to}</strong> status, achieve these action items:
              </p>
            )}

            <div className="space-y-2 pt-1">
              {plan.nudgesForLevel.map((nudge, idx) => {
                const newTotal = (member.score ?? 0) + nudge.gain;
                const newLight = trafficLight(newTotal);
                const current = member.breakdown?.[nudge.category]?.points;
                const max = member.breakdown?.[nudge.category]?.max;
                const hasPts = Number.isFinite(current) && Number.isFinite(max);

                return (
                  <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wide text-emerald-400">
                        {CAT_LABELS[nudge.category] || nudge.category}
                        {hasPts && ` · ${current}/${max} pts`}
                      </span>
                      <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                        +{nudge.gain} pts
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-200 leading-relaxed">{nudge.action}</p>
                    <div className="text-[11px] font-mono text-slate-400">
                      New total: <strong className="text-white">{newTotal}/100</strong> {newLight.emoji} {newLight.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Metric Breakdown Grid */}
          <div className="space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>Category Breakdown & Rates</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map((cat) => {
                const bd = member.breakdown?.[cat.key];
                const pts = bd?.points ?? 0;
                const max = bd?.max ?? 0;
                const pct = max > 0 ? (pts / max) * 100 : 0;

                return (
                  <div key={cat.key} className="category-breakdown-card p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-semibold">{cat.label}</span>
                      <span className="text-white font-black">{pts} / {max} pts</span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="text-[11px] font-mono text-emerald-400">
                      Current: {cat.value}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate" title={dataDict[cat.targetKey]}>
                      Target: {dataDict[cat.targetKey]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
    </UniversalModal>
  );
};
