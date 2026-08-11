import React from 'react';
import { Member } from '../types';
import { levelUpPlan, formatCurrency } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { X, Award, CheckCircle2, TrendingUp, Send, ExternalLink, ShieldCheck } from 'lucide-react';

interface MemberDetailModalProps {
  member: Member;
  onClose: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ member, onClose }) => {
  const plan = levelUpPlan(member);

  const getWAUrl = () => {
    let phone = (member.Phone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const txt = encodeURIComponent(`Hi ${member.Name}, let's review your PALMS score (${member.score}/100) and targets!`);
    return phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${txt}` : `https://web.whatsapp.com/send?text=${txt}`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <GlassCard className="w-full max-w-3xl p-6 md:p-8 space-y-6 relative border-emerald-500/30 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Member Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center text-xl font-black text-emerald-400">
                {member.Name.charAt(0)}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">{member.Name}</h2>
              <p className="text-xs text-slate-400">{member.Phone || 'No phone'} &bull; {member.Email || 'No email'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-2xl font-black text-white">{member.score} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
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
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
              title="Chat on WhatsApp"
            >
              <Send className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Level Up Plan Recommendation */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Level-Up Strategy: {plan.from} &rarr; {plan.to || 'Maintain Green'}
            </span>
            {plan.pointsNeeded > 0 && (
              <span className="text-amber-400">Need +{plan.pointsNeeded} pts for next level</span>
            )}
          </div>

          {plan.nudgesForLevel.length > 0 ? (
            <div className="space-y-1.5">
              {plan.nudgesForLevel.map((nudge, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-lg">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{nudge.action}</span>
                  </span>
                  <span className="font-bold text-emerald-400">+{nudge.gain} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Member is currently performing at peak Green status!</p>
          )}
        </div>

        {/* 7-Category Breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Award className="w-4 h-4 text-teal-400" />
            <span>7 Category Breakdown</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((cat) => {
              const b = member.breakdown?.[cat.key] || { points: 0, max: 10, value: 0 };
              const pct = b.max > 0 ? (b.points / b.max) * 100 : 0;

              return (
                <div key={cat.key} className="p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">{cat.label}</span>
                    <span className="font-bold text-white">{b.points} / {b.max} pts</span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Raw metric:</span>
                    <span className="font-mono text-slate-200">{cat.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            Close
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
