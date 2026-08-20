import React, { useState, useEffect, useRef } from 'react';
import { Organization, OrgMember, UserRole, Member, UserProfileExtended } from '../types';
import { GlassCard } from './GlassCard';
import { Building2, Users, ShieldCheck, Crown, Shield, Loader2, UserCheck, Search, Phone, Calendar, Edit3, Save, X, FileSpreadsheet, Upload, CheckCircle2, Trash2, UserPlus } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { findBestMatchingMember } from '../lib/nameMatcher';
import { arePhoneNumbersMatching, formatPhoneWithCountryCode } from '../lib/whatsappUtils';
import { UniversalModal } from './UniversalModal';
import { AddMemberModal } from './AddMemberModal';
import { scoreMember } from '../lib/scoringEngine';
import { OrgShareWidget } from './OrgShareWidget';
import * as XLSX from 'xlsx';

interface OrganizationTabProps {
  org: Organization | null;
  orgMember: OrgMember | null;
  rosterMembers?: Member[];
  onUpdateMembers?: (updated: Member[] | ((prev: Member[]) => Member[])) => void;
  userProfile?: UserProfileExtended | null;
  currentUserEmail?: string | null;
}

export const OrganizationTab: React.FC<OrganizationTabProps> = ({
  org,
  orgMember,
  rosterMembers = [],
  onUpdateMembers,
  userProfile,
  currentUserEmail,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Roster Members State & Modal Editing
  const [rosterList, setRosterList] = useState<Member[]>(rosterMembers);
  const [rosterSearch, setRosterSearch] = useState('');
  const [selectedEditMember, setSelectedEditMember] = useState<Member | null>(null);
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<Member | null>(null);
  const [isDeletingRosterMember, setIsDeletingRosterMember] = useState(false);
  const [isAddMasterMemberOpen, setIsAddMasterMemberOpen] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editJoinDate, setEditJoinDate] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);

  // File Upload Roster Update State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const [importSummaryModal, setImportSummaryModal] = useState<{
    visible: boolean;
    totalRows: number;
    updatedCount: number;
    matches: Array<{ excelName: string; matchedName: string; score: number; phone?: string; joinDate?: string }>;
  } | null>(null);

  const isAdminOrOwner = orgMember?.role === 'owner' || orgMember?.role === 'admin';

  // Helper to check if a roster member is the logged-in user (by phone or email or user_id)
  const isUserSelf = (mem: Member): boolean => {
    const currentUserId = (user && user.uid) ? user.uid : '';
    if (currentUserId && mem.user_id && mem.user_id === currentUserId) {
      return true;
    }

    if (userProfile?.phone && mem.Phone && arePhoneNumbersMatching(userProfile.phone, mem.Phone)) {
      return true;
    }

    const userEmailClean = (currentUserEmail || orgMember?.user_email || '').toLowerCase().trim();
    if (userEmailClean && mem.Email && mem.Email.toLowerCase().trim() === userEmailClean) {
      return true;
    }

    return false;
  };

  // Helper to get member avatar ONLY if phone matches logged-in user OR manually mapped to org user
  const getMemberAvatar = (mem: Member): string | null => {
    // 1. Manually linked user account (if user_id is explicitly set & non-empty)
    if (mem.user_id && mem.user_id.trim() !== '') {
      const match = members.find(m => m.user_id === mem.user_id || m.id === mem.user_id);
      if (match?.profile?.avatar_url) return match.profile.avatar_url;
    }
    // 2. Phone match with logged-in user
    if (isUserSelf(mem) && userProfile?.avatar_url) {
      return userProfile.avatar_url;
    }
    // 3. Default: NO avatar
    return null;
  };

  // Sync prop changes or fetch roster if not passed
  useEffect(() => {
    setRosterList(rosterMembers);
  }, [rosterMembers]);

  useEffect(() => {
    if (!org?.id) return;
    const loadData = async () => {
      setIsLoading(true);
      const res = await supabaseService.fetchOrgMembers(org.id);
      setMembers(res);
      if (!rosterMembers || rosterMembers.length === 0) {
        const fetchedRoster = await supabaseService.fetchMembers(org.id);
        setRosterList(fetchedRoster);
      }
      setIsLoading(false);
    };
    loadData();

    // Subscribe to real-time changes on members table for this org
    const unsubscribe = supabaseService.subscribeToMembers(org.id, async () => {
      const freshRoster = await supabaseService.fetchMembers(org.id);
      setRosterList(freshRoster);
      if (onUpdateMembers) onUpdateMembers(freshRoster);
    });

    return () => {
      unsubscribe();
    };
  }, [org]);

  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (!org?.id || !isAdminOrOwner) return;
    const ok = await supabaseService.updateOrgMemberRole(org.id, targetUserId, newRole);
    if (ok) {
      setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m));
      showToast(`Updated member role to ${newRole.toUpperCase()}`, 'success');
    } else {
      showToast('Failed to update member role. Check DB permissions.', 'error');
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (member: Member) => {
    setSelectedEditMember(member);
    setEditPhone(member.Phone || '');
    setEditJoinDate(member.JoinDate || '');

    // Default ALWAYS to "" (-- Automatic Matching --) unless member.user_id is a valid non-empty string matching an org user
    let matchedUserId = '';
    if (member.user_id && typeof member.user_id === 'string' && member.user_id.trim() !== '') {
      const targetId = member.user_id.trim();
      const match = members.find(m => (m.user_id && m.user_id === targetId) || (m.id && m.id === targetId));
      if (match) {
        matchedUserId = targetId;
      }
    }

    setEditUserId(matchedUserId);
    setEditAvatarUrl('');
  };

  const handleCloseEditModal = () => {
    setSelectedEditMember(null);
    setEditPhone('');
    setEditJoinDate('');
    setEditUserId('');
    setEditAvatarUrl('');
  };

  // Delete Roster Member
  const handleDeleteRosterMember = async () => {
    if (!deleteConfirmMember || !org?.id) return;
    setIsDeletingRosterMember(true);
    try {
      const mem = deleteConfirmMember;
      const normName = mem.Name.trim().toLowerCase();

      if (mem.id) {
        await supabaseService.deleteMember(mem.id, org.id);
      }

      const updatedList = rosterList.filter(
        m => m.id !== mem.id && m.Name.trim().toLowerCase() !== normName
      );
      setRosterList(updatedList);
      if (onUpdateMembers) {
        onUpdateMembers(prev => prev.filter(m => m.id !== mem.id && (m.Name || '').trim().toLowerCase() !== normName));
      }
      showToast(`Deleted member "${mem.Name}" from Chapter Master Roster!`, 'info');
      setDeleteConfirmMember(null);
    } catch (e: any) {
      showToast(e.message || 'Error deleting member.', 'error');
    } finally {
      setIsDeletingRosterMember(false);
    }
  };

  // Add Member manually to Chapter Master Roster
  const handleAddMasterMemberSave = async (newMem: Member) => {
    if (!org?.id || !user?.uid) return;
    try {
      const scored = scoreMember({
        ...newMem,
        batch_name: 'Master Roster',
        org_id: org.id,
      });

      const saved = await supabaseService.saveSingleMember(scored, org.id, user.uid);
      if (saved) {
        const updatedList = [saved, ...rosterList.filter(m => m.Name.trim().toLowerCase() !== saved.Name.trim().toLowerCase())];
        setRosterList(updatedList);
        if (onUpdateMembers) {
          onUpdateMembers(prev => [saved, ...prev.filter(m => m.Name.trim().toLowerCase() !== saved.Name.trim().toLowerCase())]);
        }
        showToast(`Added member "${saved.Name}" to Chapter Master Roster!`, 'success');
        setIsAddMasterMemberOpen(false);
      } else {
        showToast('Failed to save member to database.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error adding member to roster.', 'error');
    }
  };

  // Reset all member links for this org to Automatic Matching
  const handleResetAllUserLinks = async () => {
    if (!org?.id) return;
    setIsLoading(true);
    try {
      const ok = await supabaseService.resetAllMemberUserLinks(org.id);
      if (ok) {
        const resetList = rosterList.map(m => ({ ...m, user_id: undefined, avatar_url: undefined }));
        setRosterList(resetList);
        if (onUpdateMembers) onUpdateMembers(resetList);
        showToast('Reset all member links in org to Automatic Matching!', 'success');
      } else {
        showToast('Failed to reset member links.', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error resetting links.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [defaultCountryCode, setDefaultCountryCode] = useState('+91');

  useEffect(() => {
    if (!org?.id || !user?.uid) return;
    supabaseService.fetchOrgSettings(org.id, user.uid).then(res => {
      if (res && (res as any).defaultCountryCode) {
        setDefaultCountryCode((res as any).defaultCountryCode);
      }
    });
  }, [org, user]);

  // Save Details via Modal
  const handleSaveMemberDetails = async () => {
    if (!selectedEditMember || !selectedEditMember.id) return;
    setIsSavingMember(true);
    try {
      const memberId = selectedEditMember.id;
      const memberName = selectedEditMember.Name;
      const savingUserId = editUserId.trim();
      const formattedPhone = editPhone.trim() ? formatPhoneWithCountryCode(editPhone.trim(), defaultCountryCode) : '';

      const ok = await supabaseService.updateMemberDetails(memberId, {
        phone: formattedPhone,
        joinDate: editJoinDate.trim(),
        userId: savingUserId ? savingUserId : undefined,
      });

      if (ok) {
        const updatedList = rosterList.map(m =>
          m.id === memberId || m.Name.trim().toLowerCase() === memberName.trim().toLowerCase()
            ? {
                ...m,
                Phone: formattedPhone,
                JoinDate: editJoinDate.trim(),
                user_id: savingUserId ? savingUserId : undefined,
                avatar_url: undefined,
              }
            : m
        );
        setRosterList(updatedList);
        if (onUpdateMembers) {
          onUpdateMembers(prev =>
            prev.map(m =>
              m.id === memberId || (m.Name && m.Name.trim().toLowerCase() === memberName.trim().toLowerCase())
                ? {
                    ...m,
                    Phone: formattedPhone,
                    JoinDate: editJoinDate.trim(),
                    user_id: savingUserId ? savingUserId : undefined,
                  }
                : m
            )
          );
        }
        showToast(`Updated details for ${memberName} across all reports!`, 'success');
        handleCloseEditModal();
      } else {
        showToast(`Failed to update details for ${memberName}.`, 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Error updating member.', 'error');
    } finally {
      setIsSavingMember(false);
    }
  };

  // Handle Excel / CSV Upload & Fuzzy Matching Roster Updates (NON-BLOCKING BACKGROUND PROCESS)
  const handleExcelRosterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !org?.id) return;
    const orgId = org.id;

    showToast('🚀 Background roster update started! You can continue using the app.', 'info');

    // Run processing asynchronously in background without blocking UI
    setTimeout(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonRows || jsonRows.length === 0) {
          showToast('No valid rows found in uploaded file.', 'error');
          return;
        }

        const updatesPayload: Array<{ memberId: string; phone?: string; joinDate?: string }> = [];
        const matchResults: Array<{ excelName: string; matchedName: string; score: number; phone?: string; joinDate?: string }> = [];

        jsonRows.forEach(row => {
          const keys = Object.keys(row);
          const nameKey = keys.find(k => /^(name|member name|member|full name|membername)$/i.test(k.trim())) || keys[0];
          const phoneKey = keys.find(k => /^(phone|phone number|mobile|contact|phoneno|mobileno|cell)$/i.test(k.trim()));
          const dateKey = keys.find(k => /^(join date|joining date|induction date|inductiondate|date of joining|dateofjoining|doj)$/i.test(k.trim()));

          const rawName = String(row[nameKey] || '').trim();
          const unformattedPhone = phoneKey ? String(row[phoneKey] || '').trim() : '';
          const rawPhone = unformattedPhone ? formatPhoneWithCountryCode(unformattedPhone, defaultCountryCode) : '';
          const rawDate = dateKey ? String(row[dateKey] || '').trim() : '';

          if (!rawName) return;

          // Perform fuzzy similarity matching (threshold >= 70%)
          const match = findBestMatchingMember(rawName, rosterList, 0.70);
          if (match && match.member.id) {
            updatesPayload.push({
              memberId: match.member.id,
              phone: rawPhone,
              joinDate: rawDate,
            });

            matchResults.push({
              excelName: rawName,
              matchedName: match.member.Name,
              score: Math.round(match.score * 100),
              phone: rawPhone,
              joinDate: rawDate,
            });
          }
        });

        if (updatesPayload.length > 0) {
          const successCount = await supabaseService.batchUpdateMemberDetails(orgId, updatesPayload);
          
          const freshList = await supabaseService.fetchMembers(orgId);
          setRosterList(freshList);
          if (onUpdateMembers) onUpdateMembers(freshList);

          setImportSummaryModal({
            visible: true,
            totalRows: jsonRows.length,
            updatedCount: successCount,
            matches: matchResults,
          });

          showToast(`✅ Roster background update complete! ${successCount} members updated.`, 'success');
        } else {
          showToast('No matching members found in chapter roster.', 'warning');
        }
      } catch (err: any) {
        showToast(`Background upload error: ${err.message || err}`, 'error');
      }
    }, 50);

    e.target.value = '';
  };

  // 1. Deduplicate roster by normalized member name (guarantees 0 duplicates per org)
  const uniqueMasterRoster: Member[] = [];
  const seenMemberNames = new Set<string>();

  for (const mem of rosterList) {
    if (!mem.Name) continue;
    const normKey = mem.Name.trim().toLowerCase();
    if (seenMemberNames.has(normKey)) continue;
    seenMemberNames.add(normKey);
    uniqueMasterRoster.push(mem);
  }

  // 2. Filter Roster & Sort STRICTLY ALPHABETICAL (A to Z - never shifts order on update)
  const filteredRoster = uniqueMasterRoster
    .filter(m => {
      const q = rosterSearch.toLowerCase().trim();
      if (!q) return true;
      const cleanDigits = q.replace(/\D/g, '');
      const phoneDigits = (m.Phone || '').replace(/\D/g, '');
      return (
        m.Name.toLowerCase().includes(q) ||
        (m.Phone || '').toLowerCase().includes(q) ||
        (cleanDigits.length >= 3 && phoneDigits.includes(cleanDigits)) ||
        (m.JoinDate || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.Name.localeCompare(b.Name));

  if (!org) {
    return (
      <div className="p-8 text-center text-slate-400">
        No active organization found.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 max-w-5xl mx-auto pb-12 px-2 sm:px-0">
      {/* Card 1: Chapter Details & 6-Digit Code */}
      <GlassCard glow className="p-4 sm:p-6 space-y-6 border-white/10 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 p-[2px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
                <Building2 className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">{org.name}</h2>
              <p className="text-xs text-slate-400">
                {org.chapter_name || 'Handychapter'} &bull; {org.city || 'Regional Division'}
              </p>
            </div>
          </div>

          {/* 6-Digit Code Badge */}
          <OrgShareWidget org={org} defaultCountryCode={org.default_country_code || '+91'} />
        </div>

        {/* Info Grid */}
        {/* <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Green Threshold</span>
            <span className="text-sm font-black text-emerald-400">{org.green_threshold || 70}+ Points</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Amber Threshold</span>
            <span className="text-sm font-black text-amber-400">{org.amber_threshold || 50} - {(org.green_threshold || 70) - 1} Points</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Red Threshold</span>
            <span className="text-sm font-black text-rose-400">Below {org.red_threshold || 30} Points</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/50 border border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Team Role</span>
            <span className="text-sm font-black text-white capitalize">{orgMember?.role || 'Member'}</span>
          </div>
        </div> */}
      </GlassCard>

      {/* Card 2: Organization Team & Role Permissions (100% USER & MOBILE FRIENDLY) */}
      <GlassCard glow className="p-4 sm:p-6 space-y-4 border-slate-200/70 dark:border-white/10 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">Organization Permissions</h3>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs font-black border border-emerald-500/30 self-start sm:self-auto shrink-0">
            {members.length} Users
          </span>
        </div>

        {/* 1. MOBILE RESPONSIVE TEAM CARDS VIEW (<640px) */}
        <div className="block sm:hidden space-y-2.5">
          {isLoading ? (
            <div className="p-6 text-center text-slate-400 flex items-center justify-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span className="text-xs">Loading team...</span>
            </div>
          ) : members.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">
              No team members found. Share invite code to invite members!
            </div>
          ) : (
            members.map((mem) => {
              const isOwner = mem.role === 'owner';
              const isAdmin = mem.role === 'admin';
              const isSelfUser = mem.user_id === orgMember?.user_id || (currentUserEmail && mem.user_email === currentUserEmail);

              return (
                <div
                  key={mem.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isSelfUser
                      ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                      : 'bg-white/70 dark:bg-slate-900/60 border-slate-200/70 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      {isOwner ? <Crown className="w-4.5 h-4.5 text-amber-500 dark:text-amber-400 shrink-0" /> :
                       isAdmin ? <ShieldCheck className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400 shrink-0" /> :
                       <Shield className="w-4.5 h-4.5 text-slate-400 shrink-0" />}
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{mem.user_email || mem.user_id}</span>
                      {isSelfUser && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase shrink-0">
                          You
                        </span>
                      )}
                    </div>

                    <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full capitalize shrink-0 ${
                      isOwner ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                      isAdmin ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                      'bg-slate-200 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600/30'
                    }`}>
                      {mem.role}
                    </span>
                  </div>

                  {isAdminOrOwner && !isOwner && (
                    <div className="pt-2.5 mt-2 border-t border-slate-200/60 dark:border-white/5">
                      <button
                        onClick={() => handleRoleChange(mem.user_id, mem.role === 'admin' ? 'member' : 'admin')}
                        className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold text-center border border-slate-200/80 dark:border-white/10 transition-all active:scale-98"
                      >
                        {mem.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 2. DESKTOP TEAM TABLE VIEW (>=640px) */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200/70 dark:border-white/10">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100/90 dark:bg-slate-900/80 uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-white/10 font-black">
              <tr>
                <th className="px-4 py-3">Member Email</th>
                <th className="px-4 py-3">Role</th>
                {isAdminOrOwner && <th className="px-4 py-3 text-right">Role Access Control</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5 bg-white/40 dark:bg-slate-950/40">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse border-b border-slate-200/50 dark:border-white/5">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded-md w-48" /></td>
                    <td className="px-4 py-3.5"><div className="h-5 bg-emerald-500/20 rounded-full w-16" /></td>
                    {isAdminOrOwner && <td className="px-4 py-3.5 text-right"><div className="h-7 bg-slate-200 dark:bg-slate-800/60 rounded-xl w-24 ml-auto" /></td>}
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={isAdminOrOwner ? 3 : 2} className="px-4 py-6 text-center text-slate-500">
                    No team members found in this organization. Share your invite code to invite members!
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isSelf = m.user_id === orgMember?.user_id || (currentUserEmail && m.user_email === currentUserEmail);
                  return (
                    <tr key={m.id} className={`hover:bg-slate-100/60 dark:hover:bg-slate-800/40 ${isSelf ? 'bg-emerald-500/5' : ''}`}>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                        {m.role === 'owner' ? <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400" /> :
                         m.role === 'admin' ? <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> :
                         <Shield className="w-4 h-4 text-slate-400" />}
                        <span>{m.user_email || m.user_id}</span>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase">
                            You
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full capitalize ${
                          m.role === 'owner' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                          m.role === 'admin' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                          'bg-slate-200 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600/30'
                        }`}>
                          {m.role}
                        </span>
                      </td>

                      {isAdminOrOwner && (
                        <td className="px-4 py-3 text-right">
                          {m.role !== 'owner' ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user_id, e.target.value as UserRole)}
                              className="px-2 py-1 rounded-lg text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/15 cursor-pointer"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className="text-[11px] text-slate-500">Fixed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Card 3: Chapter Master Roster & Mobile-Friendly Views */}
      <GlassCard glow className="p-4 sm:p-6 space-y-4 border-slate-200/70 dark:border-white/10 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center space-x-2.5">
              <UserCheck className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">Chapter Master Roster</h3>
              </div>
            </div>
            {/* Count Badge on Mobile */}
            <span className="sm:hidden px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs font-black border border-emerald-500/30 shrink-0">
              {filteredRoster.length} Members
            </span>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleExcelRosterUpload}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <button
              onClick={() => setIsAddMasterMemberOpen(true)}
              className="w-full sm:w-auto px-3 sm:px-3.5 py-2.5 sm:py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center space-x-1 border border-slate-200/80 dark:border-white/10 transition-all active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="truncate">Add Member</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingExcel}
              className="w-full sm:w-auto px-3 sm:px-3.5 py-2.5 sm:py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-1 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-75 cursor-pointer"
            >
              {isProcessingExcel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">Matching...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="truncate">Update File</span>
                </>
              )}
            </button>

            {/* Count Badge on Desktop */}
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs font-black border border-emerald-500/30 shrink-0">
              {filteredRoster.length} Members
            </span>
          </div>
        </div>

        {/* Search Roster Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Search report member by name or phone..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-white/15 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* 1. MOBILE RESPONSIVE CARDS VIEW (<640px) */}
        <div className="block sm:hidden space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredRoster.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No report members found. Upload an Excel/CSV file to update details!
            </div>
          ) : (
            filteredRoster.map((mem) => {
              const self = isUserSelf(mem);
              const avatar = getMemberAvatar(mem);
              return (
                <div
                  key={mem.id || mem.Name}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    self
                      ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                      : 'bg-white/70 dark:bg-slate-900/60 border-slate-200/70 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {avatar ? (
                        <img src={avatar} alt={mem.Name} className="w-8 h-8 rounded-full object-cover border border-emerald-500/40 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300/60 dark:border-white/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs flex items-center justify-center shrink-0 uppercase">
                          {mem.Name.slice(0, 2)}
                        </div>
                      )}
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="text-slate-900 dark:text-white font-extrabold text-sm truncate">{mem.Name}</span>
                        {self && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase tracking-wider shrink-0">
                            You
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(mem)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-slate-200/80 dark:border-white/10 flex items-center space-x-1 active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setDeleteConfirmMember(mem)}
                        title="Delete Member"
                        className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 active:scale-95 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-white/5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{mem.Phone ? formatPhoneWithCountryCode(mem.Phone) : <span className="text-slate-400 italic">No phone set</span>}</span>
                    </div>
                    {mem.JoinDate && (
                      <div className="flex items-center space-x-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{mem.JoinDate}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. DESKTOP ROSTER TABLE VIEW (>=640px) */}
        <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[500px] rounded-xl border border-slate-200/70 dark:border-white/10 pr-1">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100/90 dark:bg-slate-900/80 uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200/70 dark:border-white/10 font-black">
              <tr>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Phone Number</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5 bg-white/40 dark:bg-slate-950/40">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    No report members found. Upload an Excel/CSV file to update chapter details!
                  </td>
                </tr>
              ) : (
                filteredRoster.map((mem) => {
                  const self = isUserSelf(mem);
                  const avatar = getMemberAvatar(mem);

                  return (
                    <tr key={mem.id || mem.Name} className={`transition-colors ${self ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'}`}>
                      {/* Member Name + Avatar + YOU Tag */}
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-2.5">
                          {avatar ? (
                            <img src={avatar} alt={mem.Name} className="w-8 h-8 rounded-full object-cover border border-emerald-500/40 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300/60 dark:border-white/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs flex items-center justify-center shrink-0 uppercase">
                              {mem.Name.slice(0, 2)}
                            </div>
                          )}
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-900 dark:text-slate-100 font-extrabold text-sm">{mem.Name}</span>
                            {self && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center space-x-1">
                                <UserCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>You</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-slate-800 dark:text-slate-200">{mem.Phone ? formatPhoneWithCountryCode(mem.Phone) : <span className="text-slate-400 italic">No phone set</span>}</span>
                        </div>
                      </td>

                      {/* Actions (Edit & Delete) */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditModal(mem)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all border border-slate-200/80 dark:border-white/10 flex items-center space-x-1.5 active:scale-95"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => setDeleteConfirmMember(mem)}
                            title="Delete Member"
                            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 active:scale-95 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* MODAL 1: EDIT MEMBER PHONE & JOINING DATE */}
      <UniversalModal
        isOpen={!!selectedEditMember}
        onClose={handleCloseEditModal}
        title={`Edit ${selectedEditMember?.Name || 'Member'}`}
        icon={<UserCheck className="w-5 h-5" />}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {/* Phone Number Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Phone Number</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="9876543210"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Induction / Joining Date Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Induction / Joining Date</span>
            </label>
            <input
              type="date"
              value={editJoinDate}
              onChange={(e) => setEditJoinDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Link to Organization User Account Dropdown */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Link to Organization User Account</span>
            </label>
            <select
              value={editUserId || ''}
              onChange={(e) => {
                const uId = e.target.value;
                setEditUserId(uId);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs font-bold text-emerald-300 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="">-- Automatic Matching (by Phone/Email) --</option>
              {members.map(m => {
                const optionVal = m.user_id || m.id;
                if (!optionVal || typeof optionVal !== 'string' || optionVal.trim() === '') return null;
                const uName = m.profile?.full_name || m.user_email || optionVal;
                const uPhone = m.profile?.phone ? ` (${m.profile.phone})` : '';
                return (
                  <option key={optionVal} value={optionVal}>
                    {uName}{uPhone} [{m.role.toUpperCase()}]
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-slate-400">
              Manually link this report member to an organization user profile & avatar.
            </p>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
            <button
              onClick={handleCloseEditModal}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all border border-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveMemberDetails}
              disabled={isSavingMember}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center space-x-2 shadow-lg shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-75"
            >
              {isSavingMember ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </UniversalModal>

      {/* MODAL 2: EXCEL/CSV ROSTER IMPORT SUMMARY MODAL */}
      {importSummaryModal && (
        <UniversalModal
          isOpen={importSummaryModal.visible}
          onClose={() => setImportSummaryModal(null)}
          title="Roster Update Complete"
          icon={<CheckCircle2 className="w-5 h-5" />}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            {/* Summary Stat Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-900 border border-white/5">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Total File Rows</span>
                <span className="text-lg font-black text-white">{importSummaryModal.totalRows}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Members Updated</span>
                <span className="text-lg font-black text-emerald-400">{importSummaryModal.updatedCount}</span>
              </div>
            </div>

            {/* Match Details List */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Fuzzy Name Matches & Updates Log:</label>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1 rounded-xl border border-white/10 p-3 bg-slate-950/60 text-xs">
                {importSummaryModal.matches.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white truncate max-w-[220px]">{item.excelName}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                        item.score >= 95 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      }`}>
                        {item.score}% Similar Match
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center space-x-3 font-mono">
                      <span>Phone: {item.phone || 'N/A'}</span>
                      <span>•</span>
                      <span>Joined: {item.joinDate || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setImportSummaryModal(null)}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </UniversalModal>
      )}

      {/* MODAL 3: DELETE MEMBER CONFIRMATION MODAL */}
      {deleteConfirmMember && (
        <UniversalModal
          isOpen={!!deleteConfirmMember}
          onClose={() => setDeleteConfirmMember(null)}
          title={`Delete ${deleteConfirmMember.Name}`}
          icon={<Trash2 className="w-5 h-5 text-rose-500" />}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to remove <strong className="text-slate-900 dark:text-white">{deleteConfirmMember.Name}</strong> from the Chapter Master Roster?
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
              This action will remove the member record from the master roster database.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteConfirmMember(null)}
                disabled={isDeletingRosterMember}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRosterMember}
                disabled={isDeletingRosterMember}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center space-x-1.5 active:scale-95 transition-all"
              >
                {isDeletingRosterMember ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Delete Member</span>
              </button>
            </div>
          </div>
        </UniversalModal>
      )}

      {/* MODAL 4: ADD MEMBER TO CHAPTER MASTER ROSTER MODAL */}
      {isAddMasterMemberOpen && (
        <AddMemberModal
          isOpen={isAddMasterMemberOpen}
          isRosterOnly={true}
          onClose={() => setIsAddMasterMemberOpen(false)}
          onSave={handleAddMasterMemberSave}
          chapters={[org?.chapter_name || org?.name || 'Handychapter']}
        />
      )}
    </>
  );
};
