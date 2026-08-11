import React, { useState } from 'react';
import { Member } from '../types';
import { GlassCard } from './GlassCard';
import { MessageSquare, ExternalLink, Copy, Check, Sparkles, Send, RefreshCw, AlertCircle } from 'lucide-react';

interface NudgeSenderProps {
  members: Member[];
}

export const NudgeSender: React.FC<NudgeSenderProps> = ({ members }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Amber' | 'Red' | 'Grey'>('Red');

  // Members needing improvement (Amber, Red, Grey)
  const targetMembers = members.filter(m => {
    if (selectedFilter === 'All') return m.trafficLight?.label !== 'Green';
    return m.trafficLight?.label === selectedFilter;
  });

  const generateNudgeMessage = (member: Member): string => {
    const nudges = member.nudges || [];
    const score = member.score || 0;
    const light = member.trafficLight?.label || 'Grey';
    const firstTwoNudges = nudges.slice(0, 2).map(n => `• ${n.action}`).join('\n');

    return `Hi ${member.Name}! 👋\n\nYour current BNI Traffic Light status is *${light}* with a score of *${score}/100*.\n\nTo reach Green status (70+ points), here are your top recommended actions:\n${firstTwoNudges || '• Maintain attendance and submit 1-2-1s!'}\n\nLet\'s collaborate to grow our business together! 🚀\n- BNI Chapter Director`;
  };

  const getWhatsAppLink = (member: Member, message: string): string => {
    let cleanPhone = (member.Phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone; // Default India prefix if 10 digits
    const encoded = encodeURIComponent(message);
    return cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`;
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-400" />
            <span>WhatsApp Outbound Nudges</span>
          </h2>
          <p className="text-xs text-slate-400">
            Send personalized performance improvement nudges directly via WhatsApp Web to members.
          </p>
        </div>

        {/* Filter Stage Buttons */}
        <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-white/10">
          {(['Red', 'Amber', 'Grey', 'All'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedFilter === filter
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {filter === 'All' ? 'All Needs Improvement' : `${filter} Stage`}
            </button>
          ))}
        </div>
      </div>

      {targetMembers.length === 0 ? (
        <GlassCard className="p-12 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">No members match stage "{selectedFilter}"</h3>
          <p className="text-xs text-slate-400">Great job! All members in this category are performing well.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {targetMembers.map((member, idx) => {
            const message = generateNudgeMessage(member);
            const waLink = getWhatsAppLink(member, message);
            const memberId = member.id || `member-${idx}`;

            return (
              <GlassCard key={memberId} className="p-5 space-y-4 flex flex-col justify-between border-white/10 hover:border-emerald-500/30">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-emerald-400">
                        {member.Name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{member.Name}</h4>
                        <span className="text-[11px] text-slate-400">{member.Phone || 'No phone number'}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`px-2 py-0.5 text-[11px] font-extrabold rounded-full ${
                        member.trafficLight?.label === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                      }`}>
                        {member.trafficLight?.label} ({member.score} pts)
                      </span>
                    </div>
                  </div>

                  {/* Nudge Message Preview */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-slate-300 font-mono whitespace-pre-wrap relative leading-relaxed">
                    {message}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2 border-t border-white/5">
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Open in WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>

                  <button
                    onClick={() => handleCopy(memberId, message)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs flex items-center justify-center transition-all"
                    title="Copy Message Text"
                  >
                    {copiedId === memberId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
