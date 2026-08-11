import React, { useState, useMemo } from 'react';
import { Member } from '../types';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { AddMemberModal } from './AddMemberModal';
import { Search, Filter, MessageSquare, Award, ArrowUpDown, ChevronRight, Download, Users, TrendingUp, Trash2, Edit, UserPlus } from 'lucide-react';

interface DashboardProps {
  members: Member[];
  onSelectMember: (member: Member) => void;
  onOpenImport: () => void;
  onOpenNudges: () => void;
  onSaveMember: (member: Member) => Promise<void>;
  onDeleteMember: (memberId: string) => Promise<void>;
  onPurgeAll: () => Promise<void>;
  isSyncing?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  members,
  onSelectMember,
  onOpenImport,
  onOpenNudges,
  onSaveMember,
  onDeleteMember,
  onPurgeAll,
  isSyncing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');
  const [sortField, setSortField] = useState<'score' | 'name' | 'attendance'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal states
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    const total = members.length;
    const green = members.filter(m => m.trafficLight?.label === 'Green').length;
    const amber = members.filter(m => m.trafficLight?.label === 'Amber').length;
    const red = members.filter(m => m.trafficLight?.label === 'Red').length;
    const grey = members.filter(m => m.trafficLight?.label === 'Grey').length;
    const avgScore = total > 0 ? Math.round(members.reduce((acc, m) => acc + (m.score || 0), 0) / total) : 0;
    return { total, green, amber, red, grey, avgScore };
  }, [members]);

  // Filtered & Sorted Members
  const filteredMembers = useMemo(() => {
    return members
      .filter(m => {
        const matchesSearch = m.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (m.Phone && m.Phone.includes(searchTerm));
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
  }, [members, searchTerm, statusFilter, sortField, sortOrder]);

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

  const handlePurgeConfirm = async () => {
    setIsActionLoading(true);
    try {
      await onPurgeAll();
      setShowPurgeConfirm(false);
    } catch (e) {
      console.error('Purge error:', e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadge = (label?: string) => {
    switch (label) {
      case 'Green':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">🟢 Green</span>;
      case 'Amber':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">🟡 Amber</span>;
      case 'Red':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">🔴 Red</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/40">⚪ Grey</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
            <span>Members</span>
            <Users className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-1">{stats.total}</div>
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
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400 mt-1">{stats.red}</div>
        </GlassCard>

        <GlassCard className="p-3.5 sm:p-4 flex flex-col justify-between border-slate-600/20">
          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
            <span>⚪ Grey (&lt;30)</span>
            <Users className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-400 mt-1">{stats.grey}</div>
        </GlassCard>

        <GlassCard glow className="p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="text-[11px] font-bold text-teal-400 flex items-center justify-between">
            <span>Avg Score</span>
            <Award className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-teal-300 mt-1">{stats.avgScore} <span className="text-[10px] font-normal text-slate-400">/ 100</span></div>
        </GlassCard>
      </div>

      {/* Main Controls & Header */}
      <GlassCard className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search member by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-xs sm:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setMemberToEdit(null); setIsAddModalOpen(true); }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center space-x-1.5 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Member</span>
            </button>

            <button
              onClick={onOpenNudges}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Outreach Nudges</span>
            </button>

            <button
              onClick={onOpenImport}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 border border-white/10 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Import PALMS</span>
            </button>

            {members.length > 0 && (
              <button
                onClick={() => setShowPurgeConfirm(true)}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
                title="Purge All Members"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Stage:
          </span>
          {(['All', 'Green', 'Amber', 'Red', 'Grey'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                statusFilter === status
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {status === 'All' ? 'All' : status}
            </button>
          ))}
        </div>

        {/* Member Table & Cards */}
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Users className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300">No members found</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {members.length === 0
                ? 'Add a member manually or import an Excel report.'
                : 'No members match the selected search or stage filter.'}
            </p>
            {members.length === 0 && (
              <button
                onClick={() => { setMemberToEdit(null); setIsAddModalOpen(true); }}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
              >
                Add Member Manually Now
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 uppercase text-slate-400 border-b border-white/10 font-black">
                  <tr>
                    <th className="px-4 py-3.5 cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>
                      <div className="flex items-center space-x-1">
                        <span>Member Name</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3.5 cursor-pointer hover:text-white" onClick={() => toggleSort('score')}>
                      <div className="flex items-center space-x-1">
                        <span>Score</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Attendance</th>
                    <th className="px-4 py-3.5">1-2-1s</th>
                    <th className="px-4 py-3.5">Referrals</th>
                    <th className="px-4 py-3.5">TYFCB</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/40">
                  {filteredMembers.map((member, idx) => (
                    <tr
                      key={member.id || idx}
                      onClick={() => onSelectMember(member)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 font-bold text-white flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-black text-emerald-400">
                          {member.Name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-white group-hover:text-emerald-400 transition-colors">{member.Name}</div>
                          {member.Phone && <div className="text-[10px] font-normal text-slate-400">{member.Phone}</div>}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-baseline space-x-1">
                          <span className="text-base font-black text-white">{member.score}</span>
                          <span className="text-[10px] text-slate-500">/ 100</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">{getStatusBadge(member.trafficLight?.label)}</td>
                      <td className="px-4 py-3 font-semibold">{((member.breakdown?.attendance?.value || 0) * 100).toFixed(0)}%</td>
                      <td className="px-4 py-3 font-semibold">{member.OneToOnes || 0}</td>
                      <td className="px-4 py-3 font-semibold">{member.RGT || 0}</td>
                      <td className="px-4 py-3 font-semibold">₹{(member.TYFCB || 0).toLocaleString('en-IN')}</td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMemberToEdit(member);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Edit member details"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMemberToDelete(member);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectMember(member);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {filteredMembers.map((member, idx) => (
                <div
                  key={member.id || idx}
                  onClick={() => onSelectMember(member)}
                  className="p-4 rounded-xl bg-slate-900/60 border border-white/10 space-y-3 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-black text-emerald-400 text-xs">
                        {member.Name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs">{member.Name}</h4>
                        <p className="text-[10px] text-slate-400">{member.Phone || 'No phone'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <div className="text-sm font-black text-white">{member.score} <span className="text-[10px] text-slate-500">/ 100</span></div>
                        {getStatusBadge(member.trafficLight?.label)}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMemberToEdit(member);
                          setIsAddModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 bg-slate-800 border border-white/5"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[11px] text-slate-300">
                    <div>
                      <span className="text-[9px] text-slate-500 block">Attendance</span>
                      <span className="font-bold">{((member.breakdown?.attendance?.value || 0) * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">1-2-1s</span>
                      <span className="font-bold">{member.OneToOnes || 0}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Referrals</span>
                      <span className="font-bold">{member.RGT || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </GlassCard>

      {/* Add / Edit Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        memberToEdit={memberToEdit}
        onSave={onSaveMember}
        onClose={() => { setIsAddModalOpen(false); setMemberToEdit(null); }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!memberToDelete}
        type="delete"
        title={`Delete ${memberToDelete?.Name}`}
        message={`Are you sure you want to delete ${memberToDelete?.Name} from your chapter roster?`}
        onConfirm={handleDeleteConfirm}
        onClose={() => setMemberToDelete(null)}
        isLoading={isActionLoading}
      />

      {/* Purge All Modal */}
      <ConfirmationModal
        isOpen={showPurgeConfirm}
        type="purge"
        onConfirm={handlePurgeConfirm}
        onClose={() => setShowPurgeConfirm(false)}
        isLoading={isActionLoading}
      />
    </div>
  );
};
