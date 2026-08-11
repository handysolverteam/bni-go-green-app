import React, { useState, useMemo } from 'react';
import { Member } from '../types';
import { GlassCard } from './GlassCard';
import { Search, Filter, MessageSquare, Award, ArrowUpDown, ChevronRight, Download, Users, TrendingUp } from 'lucide-react';

interface DashboardProps {
  members: Member[];
  onSelectMember: (member: Member) => void;
  onOpenImport: () => void;
  onOpenNudges: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  members,
  onSelectMember,
  onOpenImport,
  onOpenNudges,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');
  const [sortField, setSortField] = useState<'score' | 'name' | 'attendance'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  const getStatusBadge = (label?: string) => {
    switch (label) {
      case 'Green':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">🟢 Green ({stats.green > 0 ? `${Math.round((stats.green/stats.total)*100)}%` : '0%'})</span>;
      case 'Amber':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">🟡 Amber</span>;
      case 'Red':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">🔴 Red</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/40">⚪ Grey</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <GlassCard className="p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>Total Members</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white mt-2">{stats.total}</div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between border-emerald-500/20">
          <div className="text-xs font-semibold text-emerald-400 flex items-center justify-between">
            <span>🟢 Green (70+)</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-2">{stats.green}</div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between border-amber-500/20">
          <div className="text-xs font-semibold text-amber-400 flex items-center justify-between">
            <span>🟡 Amber (50-69)</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-2">{stats.amber}</div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between border-rose-500/20">
          <div className="text-xs font-semibold text-rose-400 flex items-center justify-between">
            <span>🔴 Red (30-49)</span>
            <TrendingUp className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 mt-2">{stats.red}</div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between border-slate-600/20">
          <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>⚪ Grey (&lt;30)</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-400 mt-2">{stats.grey}</div>
        </GlassCard>

        <GlassCard glow className="p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-teal-400 flex items-center justify-between">
            <span>Avg Score</span>
            <Award className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-teal-300 mt-2">{stats.avgScore} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
        </GlassCard>
      </div>

      {/* Main Table & Controls Header */}
      <GlassCard className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search member by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenNudges}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/25 hover:scale-105 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Send WhatsApp Nudges</span>
            </button>

            <button
              onClick={onOpenImport}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center space-x-2 border border-white/10 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Import PALMS</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
          <span className="text-xs font-semibold text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter Stage:
          </span>
          {(['All', 'Green', 'Amber', 'Red', 'Grey'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                statusFilter === status
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {status === 'All' ? 'All Members' : status}
            </button>
          ))}
        </div>

        {/* Member Table */}
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">No members found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {members.length === 0
                ? 'Import a BNI PALMS Excel or CSV file to start scoring member performance.'
                : 'Try adjusting your search query or stage filter.'}
            </p>
            {members.length === 0 && (
              <button
                onClick={onOpenImport}
                className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
              >
                Upload Excel Sheet Now
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-xs uppercase text-slate-400 border-b border-white/10 font-bold">
                <tr>
                  <th
                    className="px-4 py-3.5 cursor-pointer hover:text-white"
                    onClick={() => toggleSort('name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Member Name</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3.5 cursor-pointer hover:text-white"
                    onClick={() => toggleSort('score')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>PALMS Score</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5">Traffic Light</th>
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
                    <td className="px-4 py-3.5 font-bold text-white flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-black text-emerald-400">
                        {member.Name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-white group-hover:text-emerald-400 transition-colors">{member.Name}</div>
                        {member.Phone && <div className="text-[11px] font-normal text-slate-400">{member.Phone}</div>}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-baseline space-x-1">
                        <span className="text-lg font-black text-white">{member.score}</span>
                        <span className="text-xs text-slate-500">/ 100</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">{getStatusBadge(member.trafficLight?.label)}</td>

                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold text-slate-300">
                        {((member.breakdown?.attendance?.value || 0) * 100).toFixed(0)}%
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold text-slate-300">
                        {member.OneToOnes || 0}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold text-slate-300">
                        {member.RGT || 0}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="text-xs font-semibold text-slate-300">
                        ₹{(member.TYFCB || 0).toLocaleString('en-IN')}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMember(member);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
