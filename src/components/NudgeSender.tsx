import React, { useState, useMemo } from 'react';
import { Member, ImportLog } from '../types';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import {
  MessageSquare, ExternalLink, Copy, Check, Sparkles, Send, Play, Pause,
  RotateCcw, AlertCircle, CheckCircle2, Clock, Trash2, ArrowLeft, Calendar, Users, Eye
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';

interface NudgeSenderProps {
  members: Member[];
  importLogs?: ImportLog[];
  initialReportName?: string | null;
  customSignature?: string;
  orgId?: string;
  onBackToDashboard?: () => void;
}

export const NudgeSender: React.FC<NudgeSenderProps> = ({
  members,
  importLogs = [],
  initialReportName = null,
  customSignature,
  orgId,
  onBackToDashboard,
}) => {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Amber' | 'Red' | 'Grey'>('Red');

  // Currently selected report for Outreach Manager view
  const [activeReportName, setActiveReportName] = useState<string | null>(initialReportName);

  // Batch queue states
  const [batchActive, setBatchActive] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'sent' | 'failed' | 'skipped'>>({});

  // Extract unique reports
  const availableReports = useMemo(() => {
    const reportMap = new Map<string, { batch_name: string; file_name?: string; created_at?: string; membersCount: number; green: number; amber: number; red: number; grey: number }>();

    importLogs.forEach(l => {
      if (l.batch_name) {
        const batchMembers = members.filter(m => m.batch_name === l.batch_name);
        reportMap.set(l.batch_name, {
          batch_name: l.batch_name,
          file_name: l.file_name,
          created_at: l.created_at,
          membersCount: batchMembers.length || l.total_records || 0,
          green: batchMembers.filter(m => m.trafficLight?.label === 'Green').length,
          amber: batchMembers.filter(m => m.trafficLight?.label === 'Amber').length,
          red: batchMembers.filter(m => m.trafficLight?.label === 'Red').length,
          grey: batchMembers.filter(m => m.trafficLight?.label === 'Grey').length,
        });
      }
    });

    members.forEach(m => {
      if (m.batch_name && !reportMap.has(m.batch_name)) {
        const batchMembers = members.filter(bm => bm.batch_name === m.batch_name);
        reportMap.set(m.batch_name, {
          batch_name: m.batch_name,
          file_name: `${m.batch_name}.xlsx`,
          created_at: (m as any).created_at || new Date().toISOString(),
          membersCount: batchMembers.length,
          green: batchMembers.filter(bm => bm.trafficLight?.label === 'Green').length,
          amber: batchMembers.filter(bm => bm.trafficLight?.label === 'Amber').length,
          red: batchMembers.filter(bm => bm.trafficLight?.label === 'Red').length,
          grey: batchMembers.filter(bm => bm.trafficLight?.label === 'Grey').length,
        });
      }
    });

    return Array.from(reportMap.values());
  }, [members, importLogs]);

  // Members scoped by active report or all members
  const scopedMembers = useMemo(() => {
    if (!activeReportName) return members;
    return members.filter(m => (m.batch_name || '') === activeReportName);
  }, [members, activeReportName]);

  // Target members needing outreach in scoped members
  const targetMembers = useMemo(() => {
    return scopedMembers.filter(m => {
      if (selectedFilter === 'All') return m.trafficLight?.label !== 'Green';
      return m.trafficLight?.label === selectedFilter;
    });
  }, [scopedMembers, selectedFilter]);

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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-400" />
            <span>{activeReportName ? `Outreach: ${activeReportName}` : 'WhatsApp Outreach Messages'}</span>
          </h2>
          <p className="text-xs text-slate-400">
            {activeReportName
              ? `Sending personalized performance messages for members in "${activeReportName}"`
              : `Select a report to start automated WhatsApp outreach for your chapter members.`}
          </p>
        </div>

        {activeReportName && (
          <button
            onClick={() => setActiveReportName(null)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 border border-white/10 transition-all self-start md:self-auto"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span>Back to Outreach Reports</span>
          </button>
        )}
      </div>

      {/* --- VIEW 1: OUTREACH REPORT CARDS (DEFAULT WHEN NO REPORT SELECTED) --- */}
      {!activeReportName && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              <span>Outreach Reports ({availableReports.length})</span>
            </h3>
          </div>

          {availableReports.length === 0 ? (
            <GlassCard className="p-10 text-center space-y-3 border-dashed border-emerald-500/30">
              <MessageSquare className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">No Uploaded Reports Available</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Upload an Excel report on your Dashboard to automatically create outreach messaging cards for member performance targets.
              </p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableReports.map((report) => {
                const reportMems = members.filter(m => m.batch_name === report.batch_name);
                const sentCount = reportMems.filter(m => statuses[m.id || m.Name] === 'sent').length;
                const needsOutreachCount = report.amber + report.red + report.grey;

                return (
                  <GlassCard
                    key={report.batch_name}
                    className="p-5 space-y-4 border-white/10 hover:border-emerald-500/50 hover:bg-slate-900/80 transition-all group flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-base font-black text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {report.batch_name}
                        </h4>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{report.created_at ? new Date(report.created_at).toLocaleString('en-IN') : 'Uploaded Recently'}</span>
                        </p>
                      </div>

                      {/* Outreach Metrics */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Target Members</span>
                          <div className="text-lg font-black text-white">{needsOutreachCount} <span className="text-[10px] text-slate-400 font-normal">/ {report.membersCount}</span></div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 space-y-0.5">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase">Messages Sent</span>
                          <div className="text-lg font-black text-emerald-400">{sentCount}</div>
                        </div>
                      </div>

                      {/* Traffic Distribution Badges */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          🟡 {report.amber} Amber
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          🔴 {report.red} Red
                        </span>
                        {report.grey > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-md bg-slate-800 text-slate-400 border border-white/10">
                            ⚪ {report.grey} Grey
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveReportName(report.batch_name)}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Open Outreach Manager</span>
                    </button>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- VIEW 2: WHATSAPP OUTREACH MANAGER (WHEN REPORT IS OPEN) --- */}
      {activeReportName && (
        <div className="space-y-6 animate-fadeIn">
          {/* Target Status Filter */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-300 flex items-center space-x-2">
                <span>Filter Target Members by Traffic Status:</span>
              </div>

              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(['Red', 'Amber', 'Grey', 'All'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                      selectedFilter === filter
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 border border-white/10'
                    }`}
                  >
                    {filter === 'All' ? 'All Non-Green' : `${filter} Zone`}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Outreach Member Message Cards */}
          <div className="space-y-4">
            {targetMembers.length === 0 ? (
              <GlassCard className="p-10 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-white">No members matching status "{selectedFilter}" in this report</p>
                <p className="text-[11px]">Select another status filter or return to reports.</p>
              </GlassCard>
            ) : (
              targetMembers.map((member) => {
                const key = member.id || member.Name;
                const msg = generateNudgeMessage(member);
                const waLink = getWhatsAppLink(member, msg);
                const status = statuses[key] || 'pending';

                return (
                  <GlassCard key={key} className="p-5 space-y-4 border-white/10 hover:border-emerald-500/30 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px]">
                          <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center font-black text-emerald-400 text-sm">
                            {member.Name.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-base font-black text-white">{member.Name}</h3>
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                              member.trafficLight?.label === 'Green' ? 'bg-emerald-500/20 text-emerald-400' :
                              member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-rose-500/20 text-rose-400'
                            }`}>
                              {member.trafficLight?.label} ({member.score}/100)
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono">{member.Phone || 'No phone provided'}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {status === 'sent' && (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Sent</span>
                          </span>
                        )}

                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => handleMarkStatus(member, 'sent')}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send WhatsApp Message</span>
                        </a>
                      </div>
                    </div>

                    {/* Pre-written WhatsApp Message Box */}
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-2 relative">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-white/5 pb-2">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Auto-Generated WhatsApp Message</span>
                        </span>

                        <button
                          onClick={() => handleCopy(key, msg)}
                          className="flex items-center space-x-1 text-slate-300 hover:text-white transition-colors"
                        >
                          {copiedId === key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === key ? 'Copied!' : 'Copy Text'}</span>
                        </button>
                      </div>

                      <p className="text-xs font-mono text-slate-200 whitespace-pre-line leading-relaxed pt-1">
                        {msg}
                      </p>
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
