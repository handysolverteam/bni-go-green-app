import React, { useState, useMemo, useEffect } from 'react';
import { Member, ImportLog } from '../types';
import { GlassCard } from './GlassCard';
import { buildOutreachMessage, formatDisplayDateTime, type MessageTemplates } from '../lib/outreachUtils';
import { getWhatsAppUrl, formatPhoneWithCountryCode } from '../lib/whatsappUtils';
import { useToast } from '../context/ToastContext';
import {
  MessageSquare, Copy, Check, Send, Play, Pause,
  RotateCcw, AlertCircle, CheckCircle2, Clock, Trash2, ArrowLeft, Calendar, Users, Eye, EyeOff, FileText, Edit, X, Tag, Phone, Search, RefreshCw, Loader2
} from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { STATUS_PILL_STYLES } from './Dashboard';
import { PageHeader } from './PageHeader';

interface NudgeSenderProps {
  members: Member[];
  importLogs?: ImportLog[];
  initialReportName?: string | null;
  onSelectReportName?: (name: string | null) => void;
  customSignature?: string;
  orgId?: string;
  onBackToDashboard?: () => void;
}

export const NudgeSender: React.FC<NudgeSenderProps> = ({
  members,
  importLogs = [],
  initialReportName = null,
  onSelectReportName,
  customSignature,
  orgId,
  onBackToDashboard,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');

  // Currently selected report for Outreach Manager view synced with parent router
  const activeReportName = initialReportName || null;

  const setActiveReportName = (name: string | null) => {
    if (onSelectReportName) {
      onSelectReportName(name);
    }
  };

  // Per-member editable messages. Custom message overrides auto-generated one.
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [editingPreviewKey, setEditingPreviewKey] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');

  // Inline member phone edit states
  const [editingPhoneMap, setEditingPhoneMap] = useState<Record<string, string>>({});
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);

  useEffect(() => {
    supabaseService.fetchOutreachLogs(orgId).then(logs => {
      if (logs && logs.length > 0) {
        const loadedStatuses: Record<string, 'pending' | 'sent' | 'failed' | 'skipped'> = {};
        logs.forEach(l => {
          if (l.member_name) {
            loadedStatuses[l.member_name] = l.status as any;
          }
        });
        setStatuses(prev => ({ ...loadedStatuses, ...prev }));
      }
    });
  }, [orgId]);

  const startEditingMessage = (key: string, member: Member) => {
    const current = customMessages[key] || buildMessageFor(member);
    setDraftMessage(current);
    setEditingPreviewKey(key);
  };

  const handleSaveCustomMessage = (key: string) => {
    if (draftMessage.trim()) {
      setCustomMessages(prev => ({ ...prev, [key]: draftMessage.trim() }));
      showToast('Custom message saved for this member', 'success');
    }
    setEditingPreviewKey(null);
  };

  const handleRegenerateMessage = (key: string, member: Member) => {
    setCustomMessages(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDraftMessage(buildMessageFor(member));
    setEditingPreviewKey(null);
    showToast('Message regenerated from member data', 'info');
  };

  // Batch queue states
  const [batchActive, setBatchActive] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [statuses, setStatuses] = useState<Record<string, 'pending' | 'sent' | 'failed' | 'skipped'>>({});

  // Extract unique reports (excluding Master Roster to match Reports Dashboard & Trends)
  const availableReports = useMemo(() => {
    const reportMap = new Map<string, { batch_name: string; file_name?: string; created_at?: string; membersCount: number; green: number; amber: number; red: number; grey: number }>();

    importLogs.forEach(l => {
      if (l.batch_name && l.batch_name !== 'Master Roster') {
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
      if (m.batch_name && m.batch_name !== 'Master Roster' && !reportMap.has(m.batch_name)) {
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

  // Track if empty reports state is 100% confirmed to eliminate any flash of empty card
  const [hasConfirmedEmptyReports, setHasConfirmedEmptyReports] = useState(false);

  useEffect(() => {
    if (availableReports.length > 0) {
      setHasConfirmedEmptyReports(true);
    } else {
      setHasConfirmedEmptyReports(false);
      const timer = setTimeout(() => {
        setHasConfirmedEmptyReports(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [availableReports.length]);

  const getMemberKey = (m: Member): string => {
    if (m.id && !m.id.startsWith('temp_')) return m.id;
    const batch = m.batch_name || 'default';
    return `${batch}_${m.Name}`;
  };

  // Members scoped by active report or all members
  const scopedMembers = useMemo(() => {
    if (!activeReportName) return members;
    return members.filter(m => (m.batch_name || '') === activeReportName);
  }, [members, activeReportName]);

  // Live Outreach Stats for scoped members
  const activeTotalCount = scopedMembers.length;
  const activeSentCount = useMemo(() => {
    return scopedMembers.filter(m => {
      return statuses[getMemberKey(m)] === 'sent';
    }).length;
  }, [scopedMembers, statuses]);

  const activeLeftCount = Math.max(0, activeTotalCount - activeSentCount);
  const activeProgressPct = activeTotalCount > 0 ? Math.round((activeSentCount / activeTotalCount) * 100) : 0;

  // Search filter & Quick Hide Sent Cards Toggle States
  const [searchTerm, setSearchTerm] = useState('');
  const [hideSentMembers, setHideSentMembers] = useState(false);

  // Target members needing outreach in scoped members (Sorted by Top Score DESC)
  const targetMembers = useMemo(() => {
    const list = scopedMembers.filter(m => {
      const isSent = statuses[getMemberKey(m)] === 'sent';
      if (hideSentMembers && isSent) return false;

      const matchesFilter = selectedFilter === 'All' || m.trafficLight?.label === selectedFilter;
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term ||
        (m.Name || '').toLowerCase().includes(term) ||
        (m.Phone || '').includes(term) ||
        (m.Chapter || '').toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });

    return [...list].sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.Name || '').localeCompare(b.Name || '');
    });
  }, [scopedMembers, selectedFilter, searchTerm, hideSentMembers, statuses]);

  const [dbSignature, setDbSignature] = useState(customSignature || 'Keep the momentum going! 💪');
  const [enableSignature, setEnableSignature] = useState(true);

  const [dbScoreTerm, setDbScoreTerm] = useState('Go Green');
  const [dbCountryCode, setDbCountryCode] = useState('+91');
  const [dbTemplates, setDbTemplates] = useState<MessageTemplates>({});

  useEffect(() => {
    if (orgId && user?.uid) {
      supabaseService.fetchOrgSettings(orgId, user.uid).then(res => {
        if (res) {
          if (res.signature) setDbSignature(res.signature);
          if (res.enableSignature !== undefined) setEnableSignature(Boolean(res.enableSignature));
          if (res.scoreTerm) setDbScoreTerm(res.scoreTerm);
          if (res.defaultCountryCode) setDbCountryCode(res.defaultCountryCode);
          setDbTemplates(res.messageTemplates);
        }
      });
    }
  }, [orgId, user]);

  // The one place a member's message is composed, so every path -- the list, "edit" and
  // "regenerate" -- agrees on the signature toggle, score label and the chapter's templates.
  const buildMessageFor = (member: Member): string =>
    buildOutreachMessage(member, {
      signature: enableSignature ? dbSignature : '',
      scoreTerm: dbScoreTerm,
      templates: dbTemplates,
    });

  const generateNudgeMessage = (member: Member): string => {
    const key = getMemberKey(member);
    if (customMessages[key]) {
      return customMessages[key];
    }
    return buildMessageFor(member);
  };

  const getWhatsAppLink = (member: Member, message: string): string => {
    return getWhatsAppUrl(member.Phone || '', message, dbCountryCode);
  };

  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  const togglePreview = (key: string) => {
    setExpandedPreviews(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyMessage = (member: Member, msg: string) => {
    const key = getMemberKey(member);
    navigator.clipboard.writeText(msg);
    showToast(`Copied WhatsApp message for ${member.Name}!`, 'info');
    setCopiedMap(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedMap(prev => ({ ...prev, [key]: false }));
    }, 2500);
  };

  const [editingJoinDateMap, setEditingJoinDateMap] = useState<Record<string, string>>({});

  const handleSaveDetails = async (member: Member, phoneVal: string, joinDateVal: string) => {
    const cleanPhone = (phoneVal || '').trim();
    const cleanJoinDate = (joinDateVal || '').trim();

    if (!cleanPhone) {
      showToast(`Please enter a phone number for ${member.Name}!`, 'error');
      return;
    }

    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      showToast(`Phone number for ${member.Name} must contain at least 10 digits!`, 'error');
      return;
    }

    const formattedPhone = formatPhoneWithCountryCode(cleanPhone, dbCountryCode);
    const key = getMemberKey(member);
    setSavingPhoneId(key);

    const success = await supabaseService.updateMemberDetails(member.id || '', {
      phone: formattedPhone,
      joinDate: cleanJoinDate,
    });

    if (success) {
      member.Phone = formattedPhone;
      if (cleanJoinDate) {
        member.JoinDate = cleanJoinDate;
        (member as any).join_date = cleanJoinDate;
      }

      showToast(`Phone number updated for ${member.Name}`, 'success');

      setEditingPhoneMap(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setEditingJoinDateMap(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      showToast('Failed to save details. Check database connection.', 'error');
    }
    setSavingPhoneId(null);
  };

  const handleStartBatch = () => {
    setBatchActive(true);
    setBatchPaused(false);
    setBatchIndex(0);
    const initialStatuses: Record<string, 'pending' | 'sent' | 'failed' | 'skipped'> = {};
    targetMembers.forEach(m => {
      initialStatuses[getMemberKey(m)] = 'pending';
    });
    setStatuses(prev => ({ ...prev, ...initialStatuses }));
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

  // Sync statuses from members' raw_data.outreach_status on mount/prop change
  useEffect(() => {
    const map: Record<string, 'pending' | 'sent' | 'failed' | 'skipped'> = {};
    members.forEach(m => {
      const key = getMemberKey(m);
      const rawStatus = (m as any).raw_data?.outreach_status || (m as any).outreach_status;
      if (rawStatus) {
        map[key] = rawStatus;
      }
    });
    setStatuses(prev => ({ ...map, ...prev }));
  }, [members]);

  const handleMarkStatus = async (member: Member, status: 'sent' | 'failed' | 'skipped') => {
    const key = getMemberKey(member);
    setStatuses(prev => ({ ...prev, [key]: status }));
    (member as any).raw_data = { ...((member as any).raw_data || {}), outreach_status: status };

    if (member.id && !member.id.startsWith('temp_')) {
      await supabaseService.updateMemberOutreachStatus(member.id, status);
    }

    await supabaseService.saveOutreachLog({
      user_id: user?.uid || 'user_anon',
      org_id: orgId,
      member_name: member.Name,
      phone: member.Phone || '',
      status,
      message: generateNudgeMessage(member),
      sent_at: new Date().toISOString(),
    });
  };

  const handleSendWhatsAppClick = (e: React.MouseEvent, member: Member, msg: string) => {
    const key = member.id || member.Name;
    const currentPhone = (editingPhoneMap[key] !== undefined ? editingPhoneMap[key] : (member.Phone || '')).trim();
    const digitsOnly = currentPhone.replace(/\D/g, '');

    // Scenario A: Missing Phone Number
    if (!currentPhone) {
      e.preventDefault();
      showToast(`Please enter a phone number for ${member.Name} before sending WhatsApp message!`, 'error');
      setEditingPhoneMap(prev => ({ ...prev, [key]: '' }));
      return;
    }

    // Scenario B: Phone entered but invalid length (<10 digits)
    if (digitsOnly.length < 10) {
      e.preventDefault();
      showToast(`Phone number for ${member.Name} must contain at least 10 digits!`, 'error');
      setEditingPhoneMap(prev => ({ ...prev, [key]: currentPhone }));
      return;
    }

    handleMarkStatus(member, 'sent');
  };

  return (
    <div className="space-y-2 pb-12">
      {/* Header */}
      <PageHeader
        icon={<MessageSquare className="w-5 h-5" />}
        title={activeReportName ? `Outreach: ${activeReportName}` : `WhatsApp Outreach (${availableReports.length})`}
        right={
          activeReportName ? (
            <button
              onClick={() => setActiveReportName(null)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm sm:text-xs flex items-center justify-center space-x-1.5 border border-white/10 transition-all min-h-[44px] sm:min-h-0"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Back to Outreach Reports</span>
            </button>
          ) : undefined
        }
      />

      {/* --- VIEW 1: OUTREACH REPORT CARDS (DEFAULT WHEN NO REPORT SELECTED) --- */}
      {!activeReportName && (
        <div className="space-y-4">
          {!hasConfirmedEmptyReports && availableReports.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <GlassCard key={i} className="p-6 space-y-4 animate-pulse border-white/10">
                  <div className="h-5 bg-slate-800/80 rounded-md w-2/3" />
                  <div className="h-3.5 bg-slate-800/50 rounded-md w-1/2" />
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="h-12 bg-slate-800/40 rounded-xl" />
                    <div className="h-12 bg-slate-800/40 rounded-xl" />
                  </div>
                  <div className="h-10 bg-slate-800/60 rounded-xl w-full" />
                </GlassCard>
              ))}
            </div>
          ) : availableReports.length === 0 ? (
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
                const sentCount = reportMems.filter(m => statuses[getMemberKey(m)] === 'sent').length;
                const needsOutreachCount = report.amber + report.red + report.grey;

                return (
                  <GlassCard
                    key={report.batch_name}
                    className="p-5 space-y-4 border-white/10 hover:border-emerald-500/50 hover:bg-slate-900/80 transition-all group flex flex-col justify-between cursor-pointer"
                    onClick={() => setActiveReportName(report.batch_name)}
                  >
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-base font-black text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {report.batch_name}
                        </h4>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{report.created_at ? formatDisplayDateTime(report.created_at) : 'Uploaded Recently'}</span>
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
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveReportName(report.batch_name); }}
                      className="w-full py-3 sm:py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm sm:text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all min-h-[44px] sm:min-h-0"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Start Outreach for Report</span>
                    </button>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- VIEW 2: ACTIVE REPORT OUTREACH MANAGER (WHEN A REPORT CARD IS CLICKED) --- */}
      {activeReportName && (
        <div className="space-y-6 animate-fadeIn">
          {/* Live Outreach Progress Banner */}
          <GlassCard className="p-4 bg-slate-900/90 border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span className="text-xs font-black text-white uppercase tracking-wider">Outreach Progress Tracker</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✅ Sent: {activeSentCount}
                </span>
                <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  ⏳ Remaining: {activeLeftCount}
                </span>
                <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-white/10">
                  Total: {activeTotalCount}
                </span>

                <button
                  type="button"
                  onClick={() => setHideSentMembers(!hideSentMembers)}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 border active:scale-95 cursor-pointer ${
                    hideSentMembers
                      ? 'bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                  }`}
                  title={hideSentMembers ? 'Click to show all members (including sent)' : 'Click to hide sent members'}
                >
                  {hideSentMembers ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{hideSentMembers ? 'Showing Unsent Only' : 'Hide Sent Cards'}</span>
                </button>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-lg shadow-emerald-500/30"
                  style={{ width: `${activeProgressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-0.5">
                <span>{activeProgressPct}% Completed</span>
                <span>{activeSentCount} of {activeTotalCount} Members Reached</span>
              </div>
            </div>
          </GlassCard>

          {/* Target Status Filter & Search Input */}
          <GlassCard className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative w-full md:w-72 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search member name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl glass-input text-xs font-semibold text-white placeholder-slate-400 border-emerald-500/30"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white rounded-md transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar w-full md:w-auto pb-1 md:pb-0">
                {(['All', 'Green', 'Amber', 'Red', 'Grey'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSelectedFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                      selectedFilter === filter ? STATUS_PILL_STYLES[filter].active : STATUS_PILL_STYLES[filter].idle
                    }`}
                  >
                    {STATUS_PILL_STYLES[filter].label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Outreach Member Cards */}
          <div className="space-y-3">
            {targetMembers.length === 0 ? (
              <GlassCard className="p-10 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-white">No members matching status "{selectedFilter}" in this report</p>
                <p className="text-[11px]">Select another status filter or return to reports.</p>
              </GlassCard>
            ) : (
              targetMembers.map((member) => {
                const key = getMemberKey(member);
                const status = statuses[key] || 'pending';
                const nudgeMsg = generateNudgeMessage(member);
                const waLink = getWhatsAppLink(member, nudgeMsg);
                const showPreview = expandedPreviews[key] || false;
                const isCopied = copiedMap[key] || false;

                return (
                  <GlassCard key={key} className="p-3.5 sm:p-4 border-white/10 hover:border-emerald-500/40 transition-all flex flex-col gap-3">
                    {/* Main Row: Info & Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Name Header with Avatar & Status Badge */}
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {/* Avatar directly before Name */}
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shrink-0 shadow-md shadow-emerald-500/20">
                            <div className="w-full h-full bg-[#001D39] rounded-full flex items-center justify-center font-black text-emerald-400 text-xs sm:text-xs">
                              {member.Name.charAt(0)}
                            </div>
                          </div>

                          <h3 className="text-sm sm:text-base font-black text-white truncate max-w-[200px] sm:max-w-none">{member.Name}</h3>

                          <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full whitespace-nowrap ${
                            member.trafficLight?.label === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            member.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            member.trafficLight?.label === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                            'badge-grey'
                          }`}>
                            {member.trafficLight?.label} ({member.score}/100)
                          </span>
                        </div>

                        {/* Phone section */}
                        <div>
                          {(!member.Phone || editingPhoneMap[key] !== undefined) ? (
                            <div className="flex flex-row items-center gap-1.5 w-full sm:w-auto pt-1">
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Phone number..."
                                value={editingPhoneMap[key] ?? (member.Phone || '')}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/[^0-9]/g, '');
                                  setEditingPhoneMap(prev => ({ ...prev, [key]: digits }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveDetails(
                                      member,
                                      editingPhoneMap[key] ?? member.Phone ?? '',
                                      ''
                                    );
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg glass-input text-xs font-mono text-white flex-1 min-w-0 sm:flex-initial sm:w-44 border-emerald-500/40"
                              />
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <button
                                  onClick={() => handleSaveDetails(
                                    member,
                                    editingPhoneMap[key] ?? member.Phone ?? '',
                                    ''
                                  )}
                                  disabled={savingPhoneId === key}
                                  className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md flex items-center justify-center transition-all shrink-0 active:scale-95"
                                  title="Save Phone Number"
                                >
                                  {savingPhoneId === key ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                {Boolean(member.Phone) && (
                                  <button
                                    onClick={() => {
                                      setEditingPhoneMap(prev => {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 transition-all shrink-0"
                                    title="Cancel Editing"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2.5 text-xs pt-0.5 flex-wrap gap-y-1">
                              {status === 'sent' && (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold border border-emerald-500/30 flex items-center justify-center gap-1 shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Sent</span>
                                </span>
                              )}
                              <p className="text-slate-400 font-mono flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{member.Phone}</span>
                              </p>
                              <button
                                onClick={() => {
                                  setEditingPhoneMap(prev => ({ ...prev, [key]: member.Phone || '' }));
                                }}
                                className="p-1 text-slate-400 hover:text-emerald-400 rounded-md transition-colors"
                                title="Edit Phone Number"
                              >
                                <Edit className="w-3.5 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons Section */}
                     <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0">
                        {/* Top Row on Mobile: 50/50 Split for Copy & Preview */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {/* Copy Message Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(member, nudgeMsg)}
                            className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 border active:scale-95 cursor-pointer whitespace-nowrap ${
                              isCopied
                                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-emerald-400 border-emerald-500/30'
                            }`}
                            title="Copy WhatsApp message text to clipboard"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                            <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                          </button>

                          {/* Preview Message Toggle Button */}
                          <button
                            type="button"
                            onClick={() => togglePreview(key)}
                            className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 border active:scale-95 cursor-pointer whitespace-nowrap ${
                              showPreview
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-white/10'
                            }`}
                            title={showPreview ? 'Hide Message Preview' : 'Show Message Preview'}
                          >
                            {showPreview ? <EyeOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                            <span>{showPreview ? 'Hide' : 'Preview'}</span>
                          </button>
                        </div>

                        {/* Bottom Row on Mobile: Full Width Send Button */}
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => handleSendWhatsAppClick(e, member, nudgeMsg)}
                          className={`w-full sm:w-auto px-4 py-2 rounded-xl font-black text-xs flex items-center justify-center space-x-1.5 shadow-lg transition-all hover:scale-[1.01] whitespace-nowrap ${
                            status === 'sent'
                              ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/10'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                          }`}
                        >
                          {status === 'sent' ? <RotateCcw className="w-3.5 h-3.5 shrink-0" /> : <Send className="w-3.5 h-3.5 shrink-0" />}
                          <span>{status === 'sent' ? 'Resend' : 'Send'}</span>
                        </a>
                      </div>
                    </div>

                    {/* Bottom Row: Collapsible Message Preview Section (Hidden by Default) */}
                    {showPreview && (
                      <div className="w-full pt-3 border-t border-white/10 space-y-2 animate-fadeIn">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Preview ({member.Name})</span>
                          </span>

                          <div className="flex items-center sm:justify-end">
                          {editingPreviewKey === key ? (
                            <div className="flex items-center space-x-1.5">
                              {/* <button
                                type="button"
                                onClick={() => handleRegenerateMessage(key, member)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 flex items-center space-x-1 transition-all"
                                title="Regenerate message from member data"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Regenerate</span>
                              </button> */}
                              <button
                                type="button"
                                onClick={() => setEditingPreviewKey(null)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveCustomMessage(key)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black flex items-center space-x-1 shadow-md shadow-emerald-500/20 transition-all"
                                title="Save custom message"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5">
                              {/* <button
                                type="button"
                                onClick={() => handleRegenerateMessage(key, member)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 flex items-center space-x-1 transition-all"
                                title="Regenerate message from member data"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Regenerate</span>
                              </button> */}
                              <button
                                type="button"
                                onClick={() => startEditingMessage(key, member)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 flex items-center space-x-1 transition-all"
                                title="Edit message for this member"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            </div>
                          )}
                          </div>
                        </div>

                        {editingPreviewKey === key ? (
                          <textarea
                            rows={8}
                            value={draftMessage}
                            onChange={(e) => setDraftMessage(e.target.value)}
                            className="w-full p-3.5 rounded-xl glass-input text-xs font-mono text-white leading-relaxed whitespace-pre-wrap border-emerald-500/40 resize-y"
                            placeholder="Edit this WhatsApp message..."
                          />
                        ) : (
                          <div className="p-3.5 rounded-xl preview-box text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto select-all shadow-inner">
                            {nudgeMsg}
                          </div>
                        )}
                      </div>
                    )}
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
