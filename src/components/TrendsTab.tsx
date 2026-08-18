import React, { useState, useMemo } from 'react';
import { Member, ImportLog } from '../types';
import { GlassCard } from './GlassCard';
import { UniversalModal } from './UniversalModal';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { levelUpPlan, trafficLight } from '../lib/scoringEngine';
import { CAT_LABELS } from '../lib/outreachUtils';
import {
  TrendingUp, TrendingDown, ArrowRight, ArrowLeftRight, Search, Filter,
  FileSpreadsheet, Award, AlertCircle, CheckCircle2, Minus, BarChart2, ShieldCheck, User,
  ArrowRightLeft, Layers
} from 'lucide-react';

interface TrendsTabProps {
  members: Member[];
  importLogs: ImportLog[];
  initialReportA?: string | null;
  initialReportB?: string | null;
  onNavigateToDashboard?: (reportName?: string) => void;
}

interface ComparisonItem {
  name: string;
  memberA: Member | null;
  memberB: Member | null;
  scoreA: number;
  scoreB: number;
  deltaScore: number;
  lightA: string;
  lightB: string;
  statusShift: 'improved' | 'declined' | 'stable';
}

export const TrendsTab: React.FC<TrendsTabProps> = ({
  members,
  importLogs,
  initialReportA,
  initialReportB,
  onNavigateToDashboard,
}) => {
  // Extract all unique report batch names
  const availableReportNames = useMemo(() => {
    const names = new Set<string>();
    importLogs.forEach(l => {
      if (l.batch_name && l.batch_name !== 'Master Roster') names.add(l.batch_name);
    });
    members.forEach(m => {
      if (m.batch_name && m.batch_name !== 'Master Roster') names.add(m.batch_name);
    });
    return Array.from(names);
  }, [members, importLogs]);

  // Selected Reports A and B
  const [reportA, setReportA] = useState<string>(() => {
    if (initialReportA && availableReportNames.includes(initialReportA)) return initialReportA;
    return availableReportNames[0] || '';
  });

  const [reportB, setReportB] = useState<string>(() => {
    if (initialReportB && availableReportNames.includes(initialReportB)) return initialReportB;
    if (availableReportNames.length > 1) return availableReportNames[1];
    return availableReportNames[0] || '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'improved' | 'declined' | 'green' | 'red'>('all');
  const [selectedComparison, setSelectedComparison] = useState<ComparisonItem | null>(null);

  // Swap Report A and Report B
  const handleSwapReports = () => {
    setReportA(reportB);
    setReportB(reportA);
  };

  // Filter members for Report A and Report B
  const membersA = useMemo(() => {
    return members.filter(m => m.batch_name === reportA);
  }, [members, reportA]);

  const membersB = useMemo(() => {
    return members.filter(m => m.batch_name === reportB);
  }, [members, reportB]);

  // Map member records by normalized name
  const mapA = useMemo(() => {
    const map = new Map<string, Member>();
    membersA.forEach(m => {
      const norm = (m.Name || '').trim().toLowerCase();
      if (norm) map.set(norm, m);
    });
    return map;
  }, [membersA]);

  const mapB = useMemo(() => {
    const map = new Map<string, Member>();
    membersB.forEach(m => {
      const norm = (m.Name || '').trim().toLowerCase();
      if (norm) map.set(norm, m);
    });
    return map;
  }, [membersB]);

  // Combine unique member names appearing in either report
  const comparisonList = useMemo(() => {
    const allNames = new Set<string>([...mapA.keys(), ...mapB.keys()]);
    const list: ComparisonItem[] = [];

    allNames.forEach(nameKey => {
      const mA = mapA.get(nameKey) || null;
      const mB = mapB.get(nameKey) || null;

      const name = mB?.Name || mA?.Name || nameKey;
      const scoreA = mA?.score || 0;
      const scoreB = mB?.score || 0;
      const deltaScore = scoreB - scoreA;

      const lightA = mA?.trafficLight?.label || 'Grey';
      const lightB = mB?.trafficLight?.label || 'Grey';

      let statusShift: 'improved' | 'declined' | 'stable' = 'stable';
      if (deltaScore > 0) statusShift = 'improved';
      else if (deltaScore < 0) statusShift = 'declined';

      list.push({
        name,
        memberA: mA,
        memberB: mB,
        scoreA,
        scoreB,
        deltaScore,
        lightA,
        lightB,
        statusShift,
      });
    });

    return list.sort((a, b) => b.deltaScore - a.deltaScore || a.name.localeCompare(b.name));
  }, [mapA, mapB]);

  // Filter comparison list based on search and tab filter
  const filteredList = useMemo(() => {
    return comparisonList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      let matchesFilter = true;

      if (filterMode === 'improved') matchesFilter = item.deltaScore > 0;
      else if (filterMode === 'declined') matchesFilter = item.deltaScore < 0;
      else if (filterMode === 'green') matchesFilter = item.lightB === 'Green';
      else if (filterMode === 'red') matchesFilter = item.lightB === 'Red';

      return matchesSearch && matchesFilter;
    });
  }, [comparisonList, searchTerm, filterMode]);

  // Aggregate Metrics Comparison
  const avgScoreA = useMemo(() => {
    if (membersA.length === 0) return 0;
    return membersA.reduce((sum, m) => sum + (m.score || 0), 0) / membersA.length;
  }, [membersA]);

  const avgScoreB = useMemo(() => {
    if (membersB.length === 0) return 0;
    return membersB.reduce((sum, m) => sum + (m.score || 0), 0) / membersB.length;
  }, [membersB]);

  const deltaAvgScore = avgScoreB - avgScoreA;

  const countGreenA = membersA.filter(m => m.trafficLight?.label === 'Green').length;
  const countGreenB = membersB.filter(m => m.trafficLight?.label === 'Green').length;

  const countRedA = membersA.filter(m => m.trafficLight?.label === 'Red').length;
  const countRedB = membersB.filter(m => m.trafficLight?.label === 'Red').length;

  const totalTYFCBA = membersA.reduce((sum, m) => sum + (m.TYFCB || 0), 0);
  const totalTYFCBB = membersB.reduce((sum, m) => sum + (m.TYFCB || 0), 0);

  const getLightBadge = (label: string) => {
    switch (label) {
      case 'Green':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[10px] font-black uppercase">🟢 Green</span>;
      case 'Amber':
        return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 text-[10px] font-black uppercase">🟡 Amber</span>;
      case 'Red':
        return <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 text-[10px] font-black uppercase">🔴 Red</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/40 text-[10px] font-black uppercase">⚪ Grey</span>;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <GlassCard glow className="p-4 sm:p-6 space-y-4 border-slate-200/70 dark:border-emerald-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 shrink-0">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-wide">Report Trend Comparison</h1>
                <p className="text-xs text-slate-600 dark:text-slate-300">Compare scores, metrics, and zone movements between reports</p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Selection Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-11 gap-3 items-center pt-2 border-t border-slate-200/70 dark:border-white/10">
          {/* Report A */}
          <div className="sm:col-span-5 space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black">Report A (Base)</span>
            </label>
            <select
              value={reportA}
              onChange={(e) => setReportA(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-emerald-500/40 text-xs font-extrabold text-slate-900 dark:text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-inner"
            >
              {availableReportNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="sm:col-span-1 flex items-center justify-center pt-1 sm:pt-4">
            <button
              onClick={handleSwapReports}
              title="Swap Report A & B"
              className="p-2 sm:p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-emerald-500/40 transition-all hover:scale-110 active:scale-95 shadow-md cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Report B */}
          <div className="sm:col-span-5 space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-black">Report B (Target)</span>
            </label>
            <select
              value={reportB}
              onChange={(e) => setReportB(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-cyan-500/40 text-xs font-extrabold text-slate-900 dark:text-cyan-300 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-inner"
            >
              {availableReportNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Aggregate Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Average PALMS Score Delta */}
        <GlassCard className="p-3.5 sm:p-4 space-y-1 border-slate-200/70 dark:border-white/10">
          <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Avg PALMS Score</span>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">{formatDecimal(avgScoreA, 1)}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">{formatDecimal(avgScoreB, 1)}</span>
          </div>
          <div className="text-[11px] font-black font-mono pt-0.5">
            {deltaAvgScore >= 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+{formatDecimal(deltaAvgScore, 1)} pts</span>
              </span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400 flex items-center space-x-1">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{formatDecimal(deltaAvgScore, 1)} pts</span>
              </span>
            )}
          </div>
        </GlassCard>

        {/* Green Zone Count */}
        <GlassCard className="p-3.5 sm:p-4 space-y-1 border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10">
          <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">🟢 Green Zone</span>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{countGreenA}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">{countGreenB}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            {countGreenB - countGreenA >= 0 ? `+${countGreenB - countGreenA} members` : `${countGreenB - countGreenA} members`}
          </span>
        </GlassCard>

        {/* Red Zone Count */}
        <GlassCard className="p-3.5 sm:p-4 space-y-1 border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10">
          <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 tracking-wider">🔴 Red Zone</span>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{countRedA}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400">{countRedB}</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            {countRedB - countRedA <= 0 ? `${countRedB - countRedA} members (Improved!)` : `+${countRedB - countRedA} members`}
          </span>
        </GlassCard>

        {/* Total TYFCB */}
        <GlassCard className="p-3.5 sm:p-4 space-y-1 border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/10">
          <span className="text-[10px] font-black uppercase text-cyan-600 dark:text-cyan-400 tracking-wider">💰 TYFCB Closed</span>
          <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
            ₹{totalTYFCBB.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block truncate">
            From ₹{totalTYFCBA.toLocaleString('en-IN')}
          </span>
        </GlassCard>
      </div>

      {/* Member Side-by-Side Comparison Table Section */}
      <GlassCard className="p-4 sm:p-6 space-y-4 border-slate-200/70 dark:border-white/10">
        {/* Search & Filter Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">Member Score Progression ({filteredList.length})</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search member..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-300 dark:border-white/10 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterMode === 'all' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterMode('improved')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterMode === 'improved' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Improved 📈
              </button>
              <button
                onClick={() => setFilterMode('declined')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterMode === 'declined' ? 'bg-rose-500 text-white font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Declined 📉
              </button>
              <button
                onClick={() => setFilterMode('green')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filterMode === 'green' ? 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Green 🟢
              </button>
            </div>
          </div>
        </div>

        {/* 1. MOBILE RESPONSIVE CARDS VIEW (<640px) */}
        <div className="block sm:hidden space-y-2.5">
          {filteredList.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-xs font-semibold">
              No matching member comparison data found between selected reports.
            </div>
          ) : (
            filteredList.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/60 border border-slate-300/80 dark:border-white/10 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">{item.name}</span>
                  {item.deltaScore > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-black font-mono">
                      +{item.deltaScore} pts 📈
                    </span>
                  ) : item.deltaScore < 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black font-mono">
                      {item.deltaScore} pts 📉
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-white/10 text-[10px] font-bold font-mono">
                      0 pts ⚪
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-slate-200/80 dark:border-white/5">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase truncate">{reportA || 'Report A'}</span>
                    <div className="flex items-center space-x-1">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{item.scoreA} pts</span>
                      {getLightBadge(item.lightA)}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase truncate">{reportB || 'Report B'}</span>
                    <div className="flex items-center space-x-1">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{item.scoreB} pts</span>
                      {getLightBadge(item.lightB)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedComparison(item)}
                  className="w-full py-2 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-black transition-all text-center mt-1 cursor-pointer active:scale-98"
                >
                  View Both Reports Comparison
                </button>
              </div>
            ))
          )}
        </div>

        {/* 2. DESKTOP COMPARISON TABLE (≥640px) */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200/70 dark:border-white/10">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/90 text-slate-700 dark:text-slate-400 border-b border-slate-200/70 dark:border-white/10 uppercase text-[10px] font-extrabold tracking-wider">
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">{reportA || 'Report A'}</th>
                <th className="py-3 px-4">{reportB || 'Report B'}</th>
                <th className="py-3 px-4 text-center">Score Delta</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5 font-medium">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs font-semibold">
                    No matching member comparison data found between selected reports.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                        {item.name}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {item.memberA ? (
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{item.scoreA} pts</span>
                          {getLightBadge(item.lightA)}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Not in Report A</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {item.memberB ? (
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{item.scoreB} pts</span>
                          {getLightBadge(item.lightB)}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Not in Report B</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {item.deltaScore > 0 ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-black font-mono inline-flex items-center space-x-1">
                          <TrendingUp className="w-3 h-3" />
                          <span>+{item.deltaScore} pts</span>
                        </span>
                      ) : item.deltaScore < 0 ? (
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-black font-mono inline-flex items-center space-x-1">
                          <TrendingDown className="w-3 h-3" />
                          <span>{item.deltaScore} pts</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10 text-xs font-bold font-mono inline-flex items-center space-x-1">
                          <Minus className="w-3 h-3" />
                          <span>0 pts</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedComparison(item)}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-white/10 text-[11px] font-bold transition-all cursor-pointer"
                      >
                        View Both Reports
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* BOTH REPORTS SIDE-BY-SIDE COMPARISON MODAL */}
      {selectedComparison && (
        <UniversalModal
          isOpen={Boolean(selectedComparison)}
          onClose={() => setSelectedComparison(null)}
          maxWidth="max-w-3xl"
          icon={<User className="w-5 h-5 text-emerald-400" />}
          title={
            <div className="flex items-center space-x-2 truncate">
              <span>{selectedComparison.name}</span>
              <span className="text-xs text-slate-400 font-normal">· Both Reports Comparison</span>
            </div>
          }
        >
          {(() => {
            const mA = selectedComparison.memberA;
            const mB = selectedComparison.memberB;

            const categoryRows = [
              {
                label: 'PALMS Total Score',
                valA: `${selectedComparison.scoreA} pts`,
                valB: `${selectedComparison.scoreB} pts`,
                delta: selectedComparison.deltaScore > 0 ? `+${selectedComparison.deltaScore} pts 📈` : `${selectedComparison.deltaScore} pts 📉`,
                isPositive: selectedComparison.deltaScore >= 0
              },
              {
                label: 'Traffic Light Zone',
                valA: selectedComparison.lightA,
                valB: selectedComparison.lightB,
                delta: `${selectedComparison.lightA} ➔ ${selectedComparison.lightB}`,
                isPositive: selectedComparison.deltaScore >= 0
              },
              {
                label: 'Attendance Record (P/A/S)',
                valA: mA ? `${mA.P || 0} P / ${mA.A || 0} A / ${mA.S || 0} S` : 'N/A',
                valB: mB ? `${mB.P || 0} P / ${mB.A || 0} A / ${mB.S || 0} S` : 'N/A',
                delta: 'Record comparison',
                isPositive: true
              },
              {
                label: '1-to-1 Meetings/wk',
                valA: mA ? formatDecimal(mA.breakdown?.oneToOnes?.value || 0, 1) : 'N/A',
                valB: mB ? formatDecimal(mB.breakdown?.oneToOnes?.value || 0, 1) : 'N/A',
                delta: (mB && mA) ? `${formatDecimal((mB.breakdown?.oneToOnes?.value || 0) - (mA.breakdown?.oneToOnes?.value || 0), 1)} rate` : '-',
                isPositive: (mB?.breakdown?.oneToOnes?.value || 0) >= (mA?.breakdown?.oneToOnes?.value || 0)
              },
              {
                label: 'CEU Education/wk',
                valA: mA ? formatDecimal(mA.breakdown?.ceu?.value || 0, 1) : 'N/A',
                valB: mB ? formatDecimal(mB.breakdown?.ceu?.value || 0, 1) : 'N/A',
                delta: (mB && mA) ? `${formatDecimal((mB.breakdown?.ceu?.value || 0) - (mA.breakdown?.ceu?.value || 0), 1)} rate` : '-',
                isPositive: (mB?.breakdown?.ceu?.value || 0) >= (mA?.breakdown?.ceu?.value || 0)
              },
              {
                label: 'Referrals Given/wk',
                valA: mA ? formatDecimal(mA.breakdown?.referrals?.value || 0, 1) : 'N/A',
                valB: mB ? formatDecimal(mB.breakdown?.referrals?.value || 0, 1) : 'N/A',
                delta: (mB && mA) ? `${formatDecimal((mB.breakdown?.referrals?.value || 0) - (mA.breakdown?.referrals?.value || 0), 1)} rate` : '-',
                isPositive: (mB?.breakdown?.referrals?.value || 0) >= (mA?.breakdown?.referrals?.value || 0)
              },
              {
                label: 'TYFCB Closed Business',
                valA: mA ? formatCurrency(mA.TYFCB || 0) : 'N/A',
                valB: mB ? formatCurrency(mB.TYFCB || 0) : 'N/A',
                delta: (mB && mA) ? formatCurrency((mB.TYFCB || 0) - (mA.TYFCB || 0)) : '-',
                isPositive: (mB?.TYFCB || 0) >= (mA?.TYFCB || 0)
              },
              {
                label: 'Visitors Brought',
                valA: mA ? (mA.V || 0) : 'N/A',
                valB: mB ? (mB.V || 0) : 'N/A',
                delta: (mB && mA) ? `${(mB.V || 0) - (mA.V || 0)} visitors` : '-',
                isPositive: (mB?.V || 0) >= (mA?.V || 0)
              },
            ];

            return (
              <div className="space-y-4 text-xs">
                {/* Score Shift Header Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-cyan-500/15 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Report Trend Movement</span>
                    <div className="flex items-center space-x-2 text-sm font-black text-white">
                      <span className="text-emerald-300">{reportA || 'Report A'}: {selectedComparison.scoreA} pts</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="text-cyan-300">{reportB || 'Report B'}: {selectedComparison.scoreB} pts</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {selectedComparison.deltaScore > 0 ? (
                      <span className="px-3 py-1.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-black font-mono inline-flex items-center space-x-1">
                        <TrendingUp className="w-4 h-4" />
                        <span>+{selectedComparison.deltaScore} Points Gain</span>
                      </span>
                    ) : selectedComparison.deltaScore < 0 ? (
                      <span className="px-3 py-1.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-black font-mono inline-flex items-center space-x-1">
                        <TrendingDown className="w-4 h-4" />
                        <span>{selectedComparison.deltaScore} Points Drop</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 border border-white/10 text-xs font-bold font-mono">
                        No Change (0 pts)
                      </span>
                    )}
                  </div>
                </div>

                {/* Side-by-Side Comparison Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-white/10">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border-b border-slate-200 dark:border-white/10 uppercase text-[10px] font-black tracking-wider">
                        <th className="py-2.5 px-3">Metric Category</th>
                        <th className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400">{reportA || 'Report A'}</th>
                        <th className="py-2.5 px-3 text-cyan-600 dark:text-cyan-400">{reportB || 'Report B'}</th>
                        <th className="py-2.5 px-3 text-right">Net Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50 dark:divide-white/5 font-medium">
                      {categoryRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-100/50 dark:hover:bg-white/5">
                          <td className="py-2.5 px-3 font-extrabold text-slate-900 dark:text-white">{r.label}</td>
                          <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-mono font-bold">{r.valA}</td>
                          <td className="py-2.5 px-3 text-slate-900 dark:text-white font-mono font-black">{r.valB}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            <span className={r.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {r.delta}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Level-Up Plan Comparison if Member exists in B */}
                {mB && (
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">Report B Action Target</span>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      Member currently holds <strong className="text-white">{mB.score}/100</strong> points in {reportB}.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </UniversalModal>
      )}
    </div>
  );
};
