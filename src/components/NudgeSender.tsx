import React, { useState } from 'react';
import { Member } from '../types';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { MessageSquare, ExternalLink, Copy, Check, Sparkles, Send, Play, Pause, RotateCcw, AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { supabaseService, OutreachLogRecord } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';

interface NudgeSenderProps {
  members: Member[];
}

export const NudgeSender: React.FC<NudgeSenderProps> = ({ members }) => {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Amber' | 'Red' | 'Grey'>('Red');

  // Batch queue states
  const [batchActive, setBatchActive] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'sent' | 'failed' | 'skipped'>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Target members needing outreach
  const targetMembers = members.filter(m => {
    if (selectedFilter === 'All') return m.trafficLight?.label !== 'Green';
    return m.trafficLight?.label === selectedFilter;
  });

  const generateNudgeMessage = (member: Member): string => {
    const nudges = member.nudges || [];
    const score = member.score || 0;
    const light = member.trafficLight?.label || 'Grey';
    const topNudges = nudges.slice(0, 2).map(n => `• ${n.action}`).join('\n');

    return `Hi ${member.Name}! 👋\n\nYour current BNI Traffic Light status is *${light}* with a score of *${score}/100*.\n\nTo reach Green status (70+ points), here are your top recommended actions:\n${topNudges || '• Maintain attendance and submit 1-2-1s!'}\n\nLet's collaborate to grow our business together! 🚀\n- BNI Chapter Director`;
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
            <span>WhatsApp Outbound Nudges</span>
          </h2>
          <p className="text-xs text-slate-400">
            Batch outreach manager with status tracking & real-time delivery logs.
          </p>
        </div>

        {/* Filter & Batch Queue Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 bg-slate-900/80 p-1.5 rounded-xl border border-white/10 text-xs font-bold">
            {(['Red', 'Amber', 'Grey', 'All'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedFilter === filter
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter === 'All' ? 'All' : filter}
              </button>
            ))}
          </div>

          {targetMembers.length > 0 && (
            <div className="flex items-center space-x-2">
              {!batchActive ? (
                <button
                  onClick={handleStartBatch}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Batch Queue</span>
                </button>
              ) : batchPaused ? (
                <button
                  onClick={handleResumeBatch}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center space-x-1 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={handlePauseBatch}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-amber-400 font-bold text-xs flex items-center space-x-1 border border-amber-500/30 transition-all"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}

              {batchActive && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 border border-white/10 transition-all"
                  title="Reset Batch"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Target Members Grid */}
      {targetMembers.length === 0 ? (
        <GlassCard className="p-12 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">No members in stage "{selectedFilter}"</h3>
          <p className="text-xs text-slate-400">All members in this category are performing well!</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {targetMembers.map((member, idx) => {
            const message = generateNudgeMessage(member);
            const waLink = getWhatsAppLink(member, message);
            const memberKey = member.id || member.Name;
            const currentStatus = statuses[memberKey] || 'pending';

            return (
              <GlassCard key={memberKey} className="p-5 space-y-4 flex flex-col justify-between border-white/10 hover:border-emerald-500/30">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-black text-xs text-emerald-400">
                        {member.Name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{member.Name}</h4>
                        <span className="text-[11px] text-slate-400">{member.Phone || 'No phone'}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                        member.trafficLight?.label === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                      }`}>
                        {member.trafficLight?.label} ({member.score} pts)
                      </span>

                      {batchActive && (
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                          currentStatus === 'sent' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          currentStatus === 'failed' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          currentStatus === 'skipped' ? 'bg-slate-700/50 text-slate-400' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {currentStatus === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                          {currentStatus === 'pending' && <Clock className="w-3 h-3 animate-spin" />}
                          {currentStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nudge Message Preview */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {message}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2 border-t border-white/5">
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleMarkStatus(member, 'sent')}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Open in WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>

                  <button
                    onClick={() => handleCopy(memberKey, message)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs flex items-center justify-center transition-all"
                    title="Copy Message Text"
                  >
                    {copiedId === memberKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal to Clear Logs */}
      <ConfirmationModal
        isOpen={showClearConfirm}
        type="clearLogs"
        onConfirm={handleResetBatch}
        onClose={() => setShowClearConfirm(false)}
      />
    </div>
  );
};
