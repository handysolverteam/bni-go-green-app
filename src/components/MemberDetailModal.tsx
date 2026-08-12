import React from 'react';
import { Member } from '../types';
import { levelUpPlan, formatCurrency } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { getWhatsAppUrl } from '../lib/whatsappUtils';
import { X, Award, CheckCircle2, TrendingUp, Send, ExternalLink, ShieldCheck } from 'lucide-react';

interface MemberDetailModalProps {
  member: Member;
  onClose: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ member, onClose }) => {
  const plan = levelUpPlan(member);

  const getWAUrl = () => {
    const txt = `Hi ${member.Name}, let's review your BNI score (${member.score}/100) and targets!`;
    return getWhatsAppUrl(member.Phone || '', txt);
  };

  const categories = [
    { key: 'attendance', label: 'Attendance Rate', value: `${((member.breakdown?.attendance?.value || 0) * 100).toFixed(0)}%` },
    { key: 'ceu', label: 'CEU (Trainings/wk)', value: (member.breakdown?.ceu?.value || 0).toFixed(2) },
    { key: 'oneToOnes', label: '1-2-1 Meetings/wk', value: (member.breakdown?.oneToOnes?.value || 0).toFixed(2) },
    { key: 'referrals', label: 'Referrals Given/wk', value: (member.breakdown?.referrals?.value || 0).toFixed(2) },
    { key: 'tyfcb', label: 'TYFCB Closed', value: formatCurrency(member.TYFCB || 0) },
    { key: 'visitors', label: 'Visitors Brought', value: member.V || 0 },
    { key: 'sponsors', label: 'Members Sponsored', value: member.Sponsors || 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-fadeIn">
      <GlassCard className="w-full max-w-3xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col relative border-t sm:border border-emerald-500/30 shadow-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl">
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/60 mx-auto mt-2.5 sm:hidden shrink-0" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-6 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-3.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center text-base sm:text-lg font-black text-emerald-400">
                {member.Name.charAt(0)}
              </div>
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-white">{member.Name}</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">{member.Phone || 'No phone'} &bull; {member.Email || 'No email'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="text-right hidden sm:block">
              <div className="text-xl font-black text-white">{member.score} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full whitespace-nowrap ${
                member.trafficLight?.label === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                {member.trafficLight?.label} Status
              </span>
            </div>

            <a
              href={getWAUrl()}
              target="_blank"
              rel="noreferrer"
              className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all flex items-center space-x-1 shrink-0"
              title="Open WhatsApp chat"
            >
              <Send className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors z-20 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* Level Up Plan */}
          <GlassCard glow className="p-5 space-y-3 border-emerald-500/30">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Level-Up Goal Plan</span>
              </h3>
              {plan.to && (
                <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  Target: {plan.to} (+{plan.pointsNeeded} pts needed)
                </span>
              )}
            </div>

            {plan.stayGreen ? (
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Member is in GREEN zone! Recommended maintenance actions below:</span>
              </div>
            ) : (
              <p className="text-xs text-slate-300">
                To reach <strong className="text-white">{plan.to}</strong> status, achieve these action items:
              </p>
            )}

            <div className="space-y-2 pt-1">
              {plan.nudgesForLevel.map((nudge, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-200">{nudge.action}</span>
                  <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                    +{nudge.gain} pts
                  </span>
                </div>
              ))}
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
                      Actual: {cat.value}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
