import React, { useState, useMemo, useEffect } from 'react';
import { Member, ImportLog, UserProfileExtended } from '../types';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { AddMemberModal } from './AddMemberModal';
import { PageHeader } from './PageHeader';
import {
  Search, Filter, MessageSquare, Award, ArrowUpDown, Download, Users, TrendingUp,
  Trash2, Edit, UserPlus, Calendar, Layers, X, Eye, FileSpreadsheet, ArrowLeft, Loader2, FileDown, BarChart3,
  UserCheck, ChevronRight, ChevronDown, User
} from 'lucide-react';
import { generateSampleExcelBuffer } from '../lib/excelParser';
import { useToast } from '../context/ToastContext';
import { formatDisplayDate, formatDisplayDateTime, buildMemberTemplateData, CAT_LABELS } from '../lib/outreachUtils';
import { levelUpPlan, trafficLight } from '../lib/scoringEngine';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { CheckCircle2 } from 'lucide-react';

export const STATUS_PILL_STYLES: Record<string, { active: string; idle: string; label: string }> = {
  All: {
    active: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md',
    idle: 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 border border-white/10',
    label: '🌐 All Members',
  },
  Green: {
    active: 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 border border-emerald-500',
    idle: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    label: '🟢 Green Zone',
  },
  Amber: {
    active: 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 border border-amber-500',
    idle: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30',
    label: '🟡 Amber Zone',
  },
  Red: {
    active: 'bg-rose-500 text-white shadow-md shadow-rose-500/30 border border-rose-500',
    idle: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30',
    label: '🔴 Red Zone',
  },
  Grey: {
    active: 'bg-slate-600 text-white shadow-md shadow-slate-600/30 border border-slate-600',
    idle: 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30',
    label: '⚪ Grey Zone',
  },
};

interface DashboardProps {
  members: Member[];
  importLogs?: ImportLog[];
  selectedReportName?: string | null;
  onSelectReportName?: (name: string | null) => void;
  onSelectMember: (member: Member) => void;
  onOpenImport: () => void;
  onOpenNudges: (reportName?: string) => void;
  onSaveMember: (member: Member) => Promise<void>;
  onDeleteMember: (memberId: string) => Promise<void>;
  onDeleteBatch?: (batchName: string, logId?: string) => Promise<void>;
  onPurgeAll: () => Promise<void>;
  isSyncing?: boolean;
  isInitialLoading?: boolean;
  isDataLoaded?: boolean;
  userProfile?: UserProfileExtended | null;
  currentUserEmail?: string | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  members,
  importLogs = [],
  selectedReportName = null,
  onSelectReportName,
  onSelectMember,
  onOpenImport,
  onOpenNudges,
  onSaveMember,
  onDeleteMember,
  onDeleteBatch,
  onPurgeAll,
  isSyncing = false,
  isInitialLoading = false,
  isDataLoaded = false,
  userProfile,
  currentUserEmail,
}) => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');
  const [sortField, setSortField] = useState<'score' | 'name' | 'attendance'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  // Currently selected Report / Batch view synced with parent router
  const activeReportName = selectedReportName || null;

  const setActiveReportName = (name: string | null) => {
    if (onSelectReportName) {
      onSelectReportName(name);
    }
  };

  // Helper to match logged-in user (by phone or email)
  const isUserSelf = React.useCallback((mem: Member): boolean => {
    const userPhoneClean = (userProfile?.phone || '').replace(/[^0-9]/g, '');
    const userEmailClean = (currentUserEmail || '').toLowerCase().trim();

    if (userPhoneClean && mem.Phone) {
      const memPhoneClean = mem.Phone.replace(/[^0-9]/g, '');
      if (
        memPhoneClean &&
        (memPhoneClean === userPhoneClean ||
          (userPhoneClean.length >= 10 && memPhoneClean.endsWith(userPhoneClean.slice(-10))) ||
          (memPhoneClean.length >= 10 && userPhoneClean.endsWith(memPhoneClean.slice(-10))))
      ) {
        return true;
      }
    }

    if (userEmailClean && mem.Email) {
      if (mem.Email.toLowerCase().trim() === userEmailClean) {
        return true;
      }
    }

    return false;
  }, [userProfile, currentUserEmail]);

  // Find all member entries in `members` that belong to the logged-in user
  const selfMemberEntries = useMemo(() => {
    return members.filter(m => isUserSelf(m));
  }, [members, isUserSelf]);

  // Unique report names/batches where this logged-in user is present (excluding Master Roster)
  const selfUserReports = useMemo(() => {
    const map = new Map<string, Member>();
    selfMemberEntries.forEach(m => {
      const bName = m.batch_name || 'Latest Report';
      if (bName !== 'Master Roster' && !map.has(bName)) {
        map.set(bName, m);
      }
    });
    return Array.from(map.entries()).map(([batchName, member]) => ({
      batchName,
      member,
    }));
  }, [selfMemberEntries]);

  // Selected report for the My Personal Performance card dropdown
  const [selectedSelfReportName, setSelectedSelfReportName] = useState<string>('');

  useEffect(() => {
    if (selfUserReports.length > 0) {
      if (!selectedSelfReportName || !selfUserReports.some(r => r.batchName === selectedSelfReportName)) {
        setSelectedSelfReportName(selfUserReports[0].batchName);
      }
    }
  }, [selfUserReports, selectedSelfReportName]);

  const activeSelfMember = useMemo(() => {
    if (!selectedSelfReportName) return selfUserReports[0]?.member || null;
    return selfUserReports.find(r => r.batchName === selectedSelfReportName)?.member || selfUserReports[0]?.member || null;
  }, [selfUserReports, selectedSelfReportName]);

  // Modal states
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<{ name: string; logId?: string } | null>(null);
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showSelfPerformanceDetails, setShowSelfPerformanceDetails] = useState(false);

  // Extract unique report batches from importLogs and members
  const availableReports = useMemo(() => {
    const reportMap = new Map<string, ImportLog>();

    // 1. Map logs (excluding any log named Master Roster)
    importLogs.forEach(l => {
      if (l.batch_name && l.batch_name !== 'Master Roster') {
        reportMap.set(l.batch_name, l);
      }
    });

    // 2. Synthesize logs for any actual report batches (ignoring Master Roster)
    members.forEach(m => {
      if (m.batch_name && m.batch_name !== 'Master Roster' && !reportMap.has(m.batch_name)) {
        const batchMembers = members.filter(bm => bm.batch_name === m.batch_name);
        const greenCount = batchMembers.filter(bm => bm.trafficLight?.label === 'Green').length;
        const amberCount = batchMembers.filter(bm => bm.trafficLight?.label === 'Amber').length;
        const redCount = batchMembers.filter(bm => bm.trafficLight?.label === 'Red').length;
        const greyCount = batchMembers.filter(bm => bm.trafficLight?.label === 'Grey').length;
        const avgScore = batchMembers.length > 0 ? Math.round(batchMembers.reduce((acc, bm) => acc + (bm.score || 0), 0) / batchMembers.length) : 0;

        reportMap.set(m.batch_name, {
          id: `synth_${m.batch_name}`,
          org_id: m.org_id || '',
          user_id: (m as any).user_id || '',
          file_name: `${m.batch_name}.xlsx`,
          batch_name: m.batch_name,
          total_records: batchMembers.length,
          green_count: greenCount,
          amber_count: amberCount,
          red_count: redCount,
          grey_count: greyCount,
          avg_score: avgScore,
          created_at: (m as any).created_at || new Date().toISOString(),
        });
      }
    });

    return Array.from(reportMap.values());
  }, [members, importLogs]);

  // Track if empty database state is 100% confirmed to prevent any premature "No Reports" flash
  const [hasConfirmedEmptyDb, setHasConfirmedEmptyDb] = useState(false);

  useEffect(() => {
    if (availableReports.length > 0) {
      setHasConfirmedEmptyDb(true);
    } else if (isDataLoaded && !isSyncing && !isInitialLoading) {
      const timer = setTimeout(() => {
        setHasConfirmedEmptyDb(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setHasConfirmedEmptyDb(false);
    }
  }, [isDataLoaded, isSyncing, isInitialLoading, availableReports.length]);

  // Active report details log object
  const currentReportLog = useMemo(() => {
    if (!activeReportName) return null;
    return availableReports.find(r => r.batch_name === activeReportName) || null;
  }, [availableReports, activeReportName]);

  // Members scoped by active Report view
  const reportMembers = useMemo(() => {
    if (!activeReportName) return members;
    return members.filter(m => (m.batch_name || '') === activeReportName);
  }, [members, activeReportName]);

  // Overall Dashboard Stats across all reports or active report
  const stats = useMemo(() => {
    const target = activeReportName ? reportMembers : members;
    const total = target.length;
    const green = target.filter(m => m.trafficLight?.label === 'Green').length;
    const amber = target.filter(m => m.trafficLight?.label === 'Amber').length;
    const red = target.filter(m => m.trafficLight?.label === 'Red').length;
    const grey = target.filter(m => m.trafficLight?.label === 'Grey').length;
    const avgScore = total > 0 ? Math.round(target.reduce((acc, m) => acc + (m.score || 0), 0) / total) : 0;
    return { total, green, amber, red, grey, avgScore };
  }, [members, reportMembers, activeReportName]);

  // Filtered & Sorted Members for Active Report Table View
  const filteredMembers = useMemo(() => {
    const cleanSearchDigits = searchTerm.replace(/\D/g, '');
    return reportMembers
      .filter(m => {
        const matchesPhone = (m.Phone && m.Phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
                             (cleanSearchDigits.length >= 3 && (m.Phone || '').replace(/\D/g, '').includes(cleanSearchDigits));
        const matchesSearch = m.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              matchesPhone ||
                              (m.Chapter && m.Chapter.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'All' || m.trafficLight?.label === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;
        if (sortField === 'score') {
          valA = a.score || 0;
          valB = b.score || 0;
        } else if (sortField === 'name') {
          return sortOrder === 'asc' ? a.Name.localeCompare(b.Name) : b.Name.localeCompare(a.Name);
        } else if (sortField === 'attendance') {
          valA = a.breakdown?.attendance?.value || 0;
          valB = b.breakdown?.attendance?.value || 0;
        }
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [reportMembers, searchTerm, statusFilter, sortField, sortOrder]);

  const toggleSort = (field: 'score' | 'name' | 'attendance') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!memberToDelete || !memberToDelete.id) return;
    setIsActionLoading(true);
    try {
      await onDeleteMember(memberToDelete.id);
      setMemberToDelete(null);
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteBatchConfirm = async () => {
    if (!batchToDelete || !onDeleteBatch) return;
    setIsActionLoading(true);
    try {
      await onDeleteBatch(batchToDelete.name, batchToDelete.logId);
      if (activeReportName === batchToDelete.name) {
        setActiveReportName(null);
      }
      setBatchToDelete(null);
    } catch (e) {
      console.error('Delete report error:', e);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Download Excel Report file
  const handleDownloadReportFile = (log: ImportLog) => {
    if (log.file_data) {
      try {
        const binary = atob(log.file_data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = log.file_name || `${log.batch_name || 'Report'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Downloaded original Excel file for "${log.batch_name}"`, 'success');
        return;
      } catch (err) {
        console.warn('Could not decode base64 file_data, generating report fallback:', err);
      }
    }

    // Fallback: Generate sample Excel file
    const buffer = generateSampleExcelBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${log.batch_name || 'Report'}_Data.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded Excel report for "${log.batch_name}"`, 'info');
  };

  // Status badge with whitespace-nowrap and shrink-0 so it NEVER breaks into 2 lines
  const getStatusBadge = (label?: string) => {
    switch (label) {
      case 'Green':
        return <span className="whitespace-nowrap inline-flex items-center shrink-0 px-2.5 py-0.5 text-xs font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">🟢 Green</span>;
      case 'Amber':
        return <span className="whitespace-nowrap inline-flex items-center shrink-0 px-2.5 py-0.5 text-xs font-black rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">🟡 Amber</span>;
      case 'Red':
        return <span className="whitespace-nowrap inline-flex items-center shrink-0 px-2.5 py-0.5 text-xs font-black rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">🔴 Red</span>;
      default:
        return <span className="whitespace-nowrap inline-flex items-center shrink-0 px-2.5 py-0.5 text-xs font-black rounded-full badge-grey">⚪ Grey</span>;
    }
  };

  return (
    <>
      <div className="space-y-2 pb-12">
      {/* --- DASHBOARD HEADER --- */}
      <PageHeader
        icon={<BarChart3 className="w-5 h-5" />}
        title={
          <span className="flex items-center gap-2">
            {activeReportName ? `Report: ${activeReportName}` : 'Reports Dashboard'}
            {isSyncing && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block shrink-0" />}
          </span>
        }
        right={
          activeReportName ? (
            <button
              onClick={() => setActiveReportName(null)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm sm:text-xs flex items-center justify-center space-x-1.5 border border-white/10 transition-all min-h-[44px] sm:min-h-0"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Back to Reports</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <button
                onClick={onOpenImport}
                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm sm:text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all min-h-[44px] sm:min-h-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import New Report</span>
              </button>
            </div>
          )
        }
      />

      {/* --- MY PERSONAL PERFORMANCE & REPORT SNAPSHOT (LOGGED-IN MEMBER - MAIN DASHBOARD ONLY) --- */}
      {!activeReportName && selfUserReports.length > 0 && activeSelfMember && (
        <div className="w-full" style={{ marginBottom: '20px' }}>
          <GlassCard glow className="p-3.5 sm:p-5 border-emerald-500/30 bg-emerald-950/20 shadow-2xl w-full">
          {/* Mobile & Desktop Single Row Card Header - Clickable anywhere across full card */}
          <div
            onClick={() => setShowSelfPerformanceDetails(!showSelfPerformanceDetails)}
            className="flex items-center justify-between gap-2 cursor-pointer select-none w-full group"
          >
            <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0 flex-1">
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt={activeSelfMember.Name} className="w-8 h-8 rounded-full object-cover border border-emerald-500/40 shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-xs shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
              )}
              
              <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black text-white truncate group-hover:text-emerald-300 transition-colors">{activeSelfMember.Name}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase tracking-wider shrink-0 hidden sm:inline-flex items-center space-x-1">
                  <UserCheck className="w-3 h-3 text-emerald-400" />
                  <span>You</span>
                </span>
                <span className="shrink-0 scale-90 sm:scale-100 origin-left">
                  {getStatusBadge(activeSelfMember.trafficLight?.label)}
                </span>
              </div>
            </div>

            {/* Right Side: Accordion Toggle */}
            <div className="flex items-center space-x-2 shrink-0">
              <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 group-hover:bg-slate-800 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center space-x-1 transition-all active:scale-95">
                <Filter className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] font-extrabold hidden xs:inline-block">Report</span>
                <ChevronDown className={`w-3.5 h-3.5 text-emerald-400 transition-transform duration-200 ${showSelfPerformanceDetails ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </div>

          {/* Hidden by Default Collapsible Metrics & Report Selector */}
          {showSelfPerformanceDetails && (
            <div className="pt-3.5 mt-3 border-t border-white/10 space-y-3.5 animate-fadeIn w-full">
              {/* Report Selector Dropdown - Full Width on Mobile, Fixed Width on Big Screens */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
                {/* <label className="text-xs font-bold text-slate-300 shrink-0">Selected Report:</label> */}
                <div className="max-h-44 overflow-y-auto w-full sm:w-80 rounded-xl border border-emerald-500/40 bg-slate-900 shadow-inner">
                  <select
                    value={selectedSelfReportName || activeSelfMember.batch_name || ''}
                    onChange={(e) => setSelectedSelfReportName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900 text-xs text-emerald-300 font-bold focus:outline-none cursor-pointer"
                  >
                    {selfUserReports.map(({ batchName }) => (
                      <option key={batchName} value={batchName} className="bg-slate-900 text-emerald-300 py-1 font-bold">
                        {batchName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Level Up Goal Plan & Category Breakdown View */}
              {(() => {
                const selfPlan = levelUpPlan(activeSelfMember);
                const selfDataDict = buildMemberTemplateData(activeSelfMember);
                const selfCategories = [
                  { key: 'attendance', label: 'Attendance Rate', value: `${formatDecimal((activeSelfMember.breakdown?.attendance?.value || 0) * 100, 1)}%`, targetKey: 'attendance_target' },
                  { key: 'ceu', label: 'CEU (Trainings/wk)', value: formatDecimal(activeSelfMember.breakdown?.ceu?.value || 0, 1), targetKey: 'ceu_target' },
                  { key: 'oneToOnes', label: '1-2-1 Meetings/wk', value: formatDecimal(activeSelfMember.breakdown?.oneToOnes?.value || 0, 1), targetKey: 'one_to_ones_target' },
                  { key: 'referrals', label: 'Referrals Given/wk', value: formatDecimal(activeSelfMember.breakdown?.referrals?.value || 0, 1), targetKey: 'referrals_target' },
                  { key: 'tyfcb', label: 'TYFCB Closed', value: formatCurrency(activeSelfMember.TYFCB || 0), targetKey: 'tyfcb_target' },
                  { key: 'visitors', label: 'Visitors Brought', value: activeSelfMember.V || 0, targetKey: 'visitors_target' },
                  { key: 'sponsors', label: 'Members Sponsored', value: activeSelfMember.Sponsors || 0, targetKey: 'sponsors_target' },
                ];

                return (
                  <div className="space-y-4 pt-1">
                    {/* Level Up Goal Plan */}
                    <GlassCard glow className="p-3.5 sm:p-4 space-y-3 border-emerald-500/30">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                          <span>Level-Up Goal Plan</span>
                        </h3>
                        {selfPlan.to && (
                          <span className="self-start sm:self-auto text-[11px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 whitespace-normal">
                            Target: {selfPlan.to} (+{selfPlan.pointsNeeded} pts needed)
                          </span>
                        )}
                      </div>

                      {selfPlan.stayGreen ? (
                        <div className="flex items-start space-x-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>You are in GREEN zone! Recommended maintenance actions below:</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          To reach <strong className="text-slate-900 dark:text-white">{selfPlan.to}</strong> status, achieve these action items:
                        </p>
                      )}

                      <div className="space-y-2 pt-1">
                        {selfPlan.nudgesForLevel.map((nudge, idx) => {
                          const newTotal = (activeSelfMember.score ?? 0) + nudge.gain;
                          const newLight = trafficLight(newTotal);
                          const current = activeSelfMember.breakdown?.[nudge.category]?.points;
                          const max = activeSelfMember.breakdown?.[nudge.category]?.max;
                          const hasPts = Number.isFinite(current) && Number.isFinite(max);

                          return (
                            <div key={idx} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                  {CAT_LABELS[nudge.category] || nudge.category}
                                  {hasPts && ` · ${current}/${max} pts`}
                                </span>
                                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                                  +{nudge.gain} pts
                                </span>
                              </div>
                              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{nudge.action}</p>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                New total: <strong className="text-slate-900 dark:text-white">{newTotal}/100</strong> {newLight.emoji} {newLight.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>

                    {/* Category Breakdown & Rates */}
                    <div className="space-y-3">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                        <span>Category Breakdown & Rates</span>
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {selfCategories.map((cat) => {
                          const bd = activeSelfMember.breakdown?.[cat.key];
                          const pts = bd?.points ?? 0;
                          const max = bd?.max ?? 0;
                          const pct = max > 0 ? (pts / max) * 100 : 0;

                          return (
                            <div key={cat.key} className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 dark:text-slate-400 font-semibold">{cat.label}</span>
                                <span className="text-slate-900 dark:text-white font-black">{pts} / {max} pts</span>
                              </div>

                              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                                Current: {cat.value}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate" title={selfDataDict[cat.targetKey]}>
                                Target: {selfDataDict[cat.targetKey]}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </GlassCard>
      </div>
    )}

      {/* --- TOP SUMMARY CARDS (SHOWN ONLY WHEN VIEWING SPECIFIC ACTIVE REPORT) --- */}
      {Boolean(activeReportName) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
              <span>Report Members</span>
              <Users className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {stats.total}
            </div>
          </GlassCard>

          <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between border-emerald-500/20">
            <div className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
              <span>🟢 Green (70+)</span>
              <Award className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">{stats.green}</div>
          </GlassCard>

          <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between border-amber-500/20">
            <div className="text-[11px] font-bold text-amber-400 flex items-center justify-between">
              <span>🟡 Amber (50-69)</span>
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">{stats.amber}</div>
          </GlassCard>

          <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between border-rose-500/20">
            <div className="text-[11px] font-bold text-rose-400 flex items-center justify-between">
              <span>🔴 Red (30-49)</span>
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-400 mt-1">{stats.red}</div>
          </GlassCard>

          <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
              <span>⚪ Grey (&lt;30)</span>
              <Users className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-400 mt-1">{stats.grey}</div>
          </GlassCard>

          <GlassCard glow className="p-3.5 sm:p-4 flex flex-col justify-between border-emerald-500/40">
            <div className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
              <span>Avg Traffic Score</span>
              <Award className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">{stats.avgScore} <span className="text-xs text-slate-400 font-normal">/ 100</span></div>
          </GlassCard>
        </div>
      )}

      {/* --- VIEW 1: MAIN REPORTS CARDS LIST (DEFAULT DASHBOARD VIEW) --- */}
      {!activeReportName && (
        <div className="space-y-4">
          {/* <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <span>Uploaded Chapter Reports {availableReports.length === 0 && !hasConfirmedEmptyDb ? '' : `(${availableReports.length})`}</span>
            </h2>
          </div> */}

          {!isDataLoaded || isInitialLoading || (availableReports.length === 0 && !hasConfirmedEmptyDb) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <GlassCard key={i} className="p-5 space-y-4 border-emerald-500/20 bg-slate-900/60 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-5 bg-slate-800/80 rounded-md w-3/4" />
                    <div className="h-3.5 bg-slate-800/50 rounded-md w-1/2" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/5">
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                  </div>
                  <div className="h-9 bg-slate-800/60 rounded-xl w-full" />
                </GlassCard>
              ))}
            </div>
          ) : availableReports.length === 0 ? (
            <GlassCard className="p-10 text-center space-y-4 border-dashed border-emerald-500/30">
              <FileSpreadsheet className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">No Excel Reports Uploaded Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Upload your BNI Traffic Light Excel file to automatically calculate PALMS scores, generate level-up nudges, and track member performance.
                </p>
              </div>
              {/* <button
                onClick={onOpenImport}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all inline-flex items-center space-x-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Upload First Excel Report</span>
              </button> */}
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableReports.map((report) => (
                <GlassCard
                  key={report.id || report.batch_name}
                  className="p-5 space-y-4 border-white/10 hover:border-emerald-500/50 hover:bg-slate-900/80 transition-all group flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <h3 className="text-base font-black text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {report.batch_name}
                        </h3>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{report.created_at ? formatDisplayDateTime(report.created_at) : 'Uploaded Recently'}</span>
                        </p>
                      </div>

                      {onDeleteBatch && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setBatchToDelete({ name: report.batch_name || '', logId: report.id }); }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                          title="Delete this report and its member data"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Report Summary Metric Cards */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Members</span>
                        <div className="text-lg font-black text-white">{report.total_records || 0}</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/20 space-y-0.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase">Avg PALMS Score</span>
                        <div className="text-lg font-black text-emerald-400">{report.avg_score || 0} <span className="text-[10px] font-normal text-slate-400">/ 100</span></div>
                      </div>
                    </div>

                    {/* Traffic Light Distribution Badges - Equal Width Grid */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1 w-full text-center">
                      <span className="py-1 px-1 text-[11px] font-extrabold rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                        🟢 {report.green_count || 0}
                      </span>
                      <span className="py-1 px-1 text-[11px] font-extrabold rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                        🟡 {report.amber_count || 0}
                      </span>
                      <span className="py-1 px-1 text-[11px] font-extrabold rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                        🔴 {report.red_count || 0}
                      </span>
                      <span className="py-1 px-1 text-[11px] font-extrabold rounded-xl bg-slate-800 text-slate-400 border border-white/10 flex items-center justify-center">
                        ⚪ {report.grey_count || 0}
                      </span>
                    </div>
                  </div>

                  {/* Card Action Buttons: Stacked Vertically on All Screens */}
                  <div className="pt-3 border-t border-white/10 flex flex-col items-stretch gap-2 w-full">
                    {/* Button 1: Open Report & Members Table inside Dashboard (Primary Solid Glowing Button) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveReportName(report.batch_name || null); }}
                      className="w-full py-3 px-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.01] transition-all min-h-[44px] active:scale-[0.98] cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-slate-950 stroke-[2.5] shrink-0" />
                      <span>Open Report & Members ({report.total_records || 0})</span>
                    </button>

                    {/* Button 2: Start WhatsApp Outreach (Subtle Secondary Button) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenNudges(report.batch_name || undefined); }}
                      className="w-full py-2.5 px-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center space-x-2 border border-white/10 hover:border-emerald-500/30 transition-all min-h-[40px] active:scale-[0.99] cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Start WhatsApp Outreach</span>
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- VIEW 2: REPORT DETAILS & MEMBER TABLE (WHEN REPORT CARD IS CLICKED) --- */}
      {activeReportName && (
        <div className="space-y-5 animate-fadeIn">
          {/* Active Report Header Bar */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* <div className="flex items-center space-x-3">
              <button
                onClick={() => setActiveReportName(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-white/10"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-base font-black text-white">{activeReportName}</h3>
                <p className="text-xs text-slate-400">
                  {reportMembers.length} members loaded from this Excel report file
                </p>
              </div>
            </div> */}

            <div className="flex flex-wrap items-center gap-2">
              {currentReportLog && (
                <button
                  onClick={() => handleDownloadReportFile(currentReportLog)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center space-x-1.5 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download Excel</span>
                </button>
              )}

              <button
                onClick={() => { setMemberToEdit(null); setIsAddModalOpen(true); }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 border border-white/10 transition-all"
              >
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Add Member</span>
              </button>

              <button
                onClick={() => onOpenNudges(activeReportName || undefined)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 border border-white/10 transition-all"
              >
                <MessageSquare className="w-4 h-4 text-teal-400" />
                <span>Start Outreach</span>
              </button>

              {/* <button
                onClick={() => setActiveReportName(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border border-white/10 hover:bg-slate-700"
              >
                Close Report
              </button> */}
            </div>
          </div>

          {/* Search, Filter & Member Controls */}
          <GlassCard className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search member name, phone, chapter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl glass-input text-xs font-semibold"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {(['All', 'Green', 'Amber', 'Red', 'Grey'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                      statusFilter === status ? STATUS_PILL_STYLES[status].active : STATUS_PILL_STYLES[status].idle
                    }`}
                  >
                    {STATUS_PILL_STYLES[status].label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Mobile Cards View (<768px) — direct cards, no parent section */}
          <div className="md:hidden space-y-2.5">
            {filteredMembers.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <Users className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-300">No members found matching filter criteria</p>
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div
                    key={member.id || member.Name}
                    className="p-2 sm:p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-emerald-500/40 transition-all space-y-2"
                  >
                    {/* Top Info Row */}
                    <div
                      className="flex items-center justify-between gap-2 cursor-pointer"
                      onClick={() => onSelectMember(member)}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shrink-0">
                          <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center font-black text-emerald-400 text-xs">
                            {member.Name.charAt(0)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">{member.Name}</h4>
                          <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                            <span>{member.Phone || 'No phone'}</span>
                            {(member.JoinDate || (member as any).join_date) && (
                              <span className="text-emerald-400/90 font-sans text-[10px]">&bull; Joined: {formatDisplayDate(member.JoinDate || (member as any).join_date)}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-white">{member.score || 0} <span className="text-[9px] text-slate-400 font-normal">/ 100</span></div>
                        <div>{getStatusBadge(member.trafficLight?.label)}</div>
                      </div>
                    </div>

                    {/* Metrics Badges Row */}
                    <div
                      onClick={() => onSelectMember(member)}
                      className="flex items-center justify-between text-[11px] text-slate-300 pt-2 border-t border-white/5 bg-slate-900/40 px-2.5 py-1.5 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                      title="View details"
                    >
                      <div>Att: <strong className="text-white">{((member.breakdown?.attendance?.value || 0) * 100).toFixed(0)}%</strong></div>
                      <div>1-2-1s: <strong className="text-white">{member.breakdown?.oneToOnes?.value ? Number(member.breakdown.oneToOnes.value).toFixed(1) : 0}</strong></div>
                      <div>Refs: <strong className="text-white">{member.breakdown?.referrals?.value ? Number(member.breakdown.referrals.value).toFixed(1) : 0}</strong></div>
                    </div>

                    {/* Mobile Action Buttons Row */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {/* <button
                        onClick={() => onSelectMember(member)}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center space-x-1 border border-emerald-500/20 transition-all active:scale-95"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button> */}

                      <button
                        onClick={() => { setMemberToEdit(member); setIsAddModalOpen(true); }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center space-x-1 border border-white/10 transition-all active:scale-95"
                      >
                        <Edit className="w-3.5 h-3.5 text-slate-300" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => setMemberToDelete(member)}
                        className="py-1.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-center space-x-1 border border-rose-500/20 transition-all active:scale-95"
                        title="Delete Member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
          </div>

          {/* Desktop Table View (>=768px) */}
          <GlassCard className="hidden md:block overflow-hidden border-white/10 p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-white/10 text-[11px] uppercase tracking-wider">
                    <th className="py-3.5 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>
                      <div className="flex items-center space-x-1">
                        <span>Member Name</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">Chapter</th>
                    <th className="py-3.5 px-4">WhatsApp Phone</th>
                    <th className="py-3.5 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('score')}>
                      <div className="flex items-center space-x-1">
                        <span>Traffic Score</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('attendance')}>
                      <div className="flex items-center space-x-1">
                        <span>Attendance</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4">1-2-1s</th>
                    <th className="py-3.5 px-4">Referrals</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5 font-semibold">
                  {isSyncing ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse border-b border-white/5">
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/80 rounded-md w-32" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/60 rounded-md w-24" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/60 rounded-md w-28" /></td>
                        <td className="py-4 px-4"><div className="h-6 bg-emerald-500/20 rounded-full w-16" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/50 rounded-md w-12" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/50 rounded-md w-10" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800/50 rounded-md w-10" /></td>
                        <td className="py-4 px-4 text-right"><div className="h-7 bg-slate-800/60 rounded-xl w-20 ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 space-y-2">
                        <Users className="w-8 h-8 text-slate-600 mx-auto" />
                        <p className="text-xs font-bold text-slate-300">No members found matching filter criteria</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => {
                      const attRate = ((member.breakdown?.attendance?.value || 0) * 100).toFixed(0);

                      return (
                        <tr
                          key={member.id || member.Name}
                          className="hover:bg-slate-900/60 transition-colors group cursor-pointer"
                          onClick={() => onSelectMember(member)}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                              {member.Name}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-300 font-medium">
                            {member.Chapter || 'Influencers'}
                          </td>

                          <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                            {member.Phone || '—'}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-black text-sm text-white">
                              {member.score || 0} <span className="text-[10px] text-slate-400 font-normal">/ 100</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {getStatusBadge(member.trafficLight?.label)}
                          </td>

                          <td className="py-3.5 px-4 text-slate-200">
                            {attRate}%
                          </td>

                          <td className="py-3.5 px-4 text-slate-200">
                            {member.breakdown?.oneToOnes?.value ? Number(member.breakdown.oneToOnes.value).toFixed(1) : 0}
                          </td>

                          <td className="py-3.5 px-4 text-slate-200">
                            {member.breakdown?.referrals?.value ? Number(member.breakdown.referrals.value).toFixed(1) : 0}
                          </td>

                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => { setMemberToEdit(member); setIsAddModalOpen(true); }}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                title="Edit Member"
                              >
                                <Edit className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setMemberToDelete(member)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Delete Member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
      </div>

      {/* Add / Edit Member Modal */}
      {isAddModalOpen && (
        <AddMemberModal
          isOpen={isAddModalOpen}
          memberToEdit={memberToEdit}
          onSave={onSaveMember}
          onClose={() => { setIsAddModalOpen(false); setMemberToEdit(null); }}
          rosterMembers={members}
          currentReportMembers={reportMembers}
        />
      )}

      {/* Single Member Delete Confirmation Modal */}
      {memberToDelete && (
        <ConfirmationModal
          isOpen={!!memberToDelete}
          type="delete"
          title={`Delete Member "${memberToDelete.Name}"?`}
          message={`Are you sure you want to remove ${memberToDelete.Name} from your chapter database?`}
          onConfirm={handleDeleteConfirm}
          onClose={() => setMemberToDelete(null)}
          isLoading={isActionLoading}
        />
      )}

      {/* Batch Delete Confirmation Modal */}
      {batchToDelete && (
        <ConfirmationModal
          isOpen={!!batchToDelete}
          type="purge"
          title={`Delete Report "${batchToDelete.name}"?`}
          message={`This will permanently remove all members belonging to report "${batchToDelete.name}" from your chapter database.`}
          onConfirm={handleDeleteBatchConfirm}
          onClose={() => setBatchToDelete(null)}
          isLoading={isActionLoading}
        />
      )}
    </>
  );
};
