import React, { useState } from 'react';
import { Member } from '../types';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { MessageSquare, ExternalLink, Copy, Check, Sparkles, Send, Play, Pause, RotateCcw, AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';

interface NudgeSenderProps {
  members: Member[];
  customSignature?: string;
  orgId?: string;
}

export const NudgeSender: React.FC<NudgeSenderProps> = ({ members, customSignature, orgId }) => {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Amber' | 'Red' | 'Grey'>('Red');

  // Batch queue states
  const [batchActive, setBatchActive] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'sent' | 'failed' | 'skipped'>>({});

  // Target members needing outreach
  const targetMembers = members.filter(m => {
    if (selectedFilter === 'All') return m.trafficLight?.label !== 'Green';
    return m.trafficLight?.label === selectedFilter;
  });

  const signature = customSignature || 'Keep the momentum going! 💪';

  const generateNudgeMessage = (member: Member): string => {
    const nudges = member.nudges || [];
    const score = member.score || 0;
    const light = member.trafficLight?.label || 'Grey';
    const topNudges = nudges.slice(0, 2).map(n => `• ${n.action}`).join('\n');

    return `Hi ${member.Name}! 👋\n\nYour current BNI Traffic Light status is *${light}* with a score of *${score}/100*.\n\nTo reach Green status (70+ points), here are your top recommended actions:\n${topNudges || '• Maintain attendance and submit 1-2-1s!'}\n\n${signature}`;
  };

  const getWhatsAppLink = (member: Member, message: string): string => {
    let cleanPhone = (member.Phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const encoded = encodeURIComponent(message);
    return cleanPhone ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`;
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartBatch = () => {
    setBatchActive(true);
    setBatchPaused(false);
    setBatchIndex(0);
    const initialStatuses: Record<string, 'pending' | 'sent' | 'failed' | 'skipped'> = {};
    targetMembers.forEach(m => {
      initialStatuses[m.id || m.Name] = 'pending';
    });
    setStatuses(initialStatuses);
  };

  const handlePauseBatch = () => {
    setBatchPaused(true);
  };

  const handleResumeBatch = () => {
    setBatchPaused(false);
  };

  const handleResetBatch = () => {
    setBatchActive(false);
    setBatchPaused(false);
    setBatchIndex(0);
    setStatuses({});
  };

  const handleMarkStatus = async (member: Member, status: 'sent' | 'failed' | 'skipped') => {
    const key = member.id || member.Name;
    setStatuses(prev => ({ ...prev, [key]: status }));

    if (user?.uid) {
      await supabaseService.saveOutreachLog({
        user_id: user.uid,
        org_id: orgId,
        member_name: member.Name,
        phone: member.Phone || '',
        status,
        message: generateNudgeMessage(member),
        sent_at: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-400" />
            <span>WhatsApp Outreach Manager</span>
          </h2>
          <p className="text-xs text-slate-400">Send personalized performance nudges directly to members via WhatsApp Web.</p>
        </div>

        {/* Filter Capsules */}
        <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-2xl border border-white/10">
          {(['Red', 'Amber', 'Grey', 'All'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setSelectedFilter(f); handleResetBatch(); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedFilter === f
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f === 'All' ? 'Non-Green' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Target Queue Summary Card */}
      <GlassCard glow className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outreach Target Queue</div>
          <div className="text-2xl font-black text-white flex items-center gap-2">
            <span>{targetMembers.length} Members Needing Nudges</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {selectedFilter} Filter
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {!batchActive ? (
            <button
              onClick={handleStartBatch}
              disabled={targetMembers.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all disabled:opacity-40"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Outreach Queue</span>
            </button>
          ) : (
            <>
              {batchPaused ? (
                <button
                  onClick={handleResumeBatch}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={handlePauseBatch}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={handleResetBatch}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs flex items-center space-x-1.5 hover:bg-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      </GlassCard>

      {/* Target Members Grid */}
      <div className="space-y-3">
        {targetMembers.map((member, idx) => {
          const msg = generateNudgeMessage(member);
          const waUrl = getWhatsAppLink(member, msg);
          const key = member.id || member.Name;
          const status = statuses[key] || 'pending';
          const isCopied = copiedId === key;

          return (
            <GlassCard key={key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5 overflow-hidden">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${
                  member.trafficLight?.label === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                  member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {member.score || 0}
                </div>

                <div className="overflow-hidden">
                  <div className="text-sm font-black text-white truncate flex items-center gap-2">
                    <span>{member.Name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {member.Phone || 'No Phone'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {member.nudges && member.nudges.length > 0 ? member.nudges[0].action : 'Maintain score'}
                  </div>
                </div>
              </div>

              {/* Status Badge & Actions */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                {status === 'sent' && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sent</span>
                  </span>
                )}

                <button
                  onClick={() => handleCopy(key, msg)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center space-x-1 border border-white/10 transition-colors"
                  title="Copy message text"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy Text'}</span>
                </button>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => handleMarkStatus(member, 'sent')}
                  className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center space-x-1.5 shadow-md transition-all hover:scale-105"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send WhatsApp</span>
                </a>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
