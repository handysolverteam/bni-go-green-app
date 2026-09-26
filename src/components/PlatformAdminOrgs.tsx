import React, { useEffect, useState } from 'react';
import { Building2, Search, Users, ArrowRight, Loader2, Crown } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { Organization } from '../types';
import { GlassCard } from './GlassCard';

interface PlatformAdminOrgsProps {
  onManage: (org: Organization) => void;
}

/**
 * Every organization on the platform, for a Platform Admin to jump into. This is the ONLY
 * cross-chapter view in the app -- everything else stays scoped to one org, on purpose (the
 * per-chapter isolation is enforced server-side; this component works only because RLS lets
 * a Platform Admin's caller_org_ids() include every org -- see migration 009).
 */
export const PlatformAdminOrgs: React.FC<PlatformAdminOrgsProps> = ({ onManage }) => {
  const [orgs, setOrgs] = useState<Array<Organization & { member_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabaseService.fetchAllOrganizationsForAdmin().then(res => {
      setOrgs(res);
      setIsLoading(false);
    });
  }, []);

  const filtered = orgs.filter(org => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (org.chapter_name || org.name || '').toLowerCase().includes(q) || org.code.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center space-x-2.5">
        <Crown className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-black text-slate-900 dark:text-white">All Organizations</h2>
        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase border border-amber-500/30">
          Platform Admin
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by chapter name or code..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading organizations...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">No organizations match "{search}".</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(org => (
            <GlassCard key={org.id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {org.chapter_name || org.name}
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>Code: {org.code}</span>
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{org.member_count}</span>
                    {org.city && <span>{org.city}</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onManage(org)}
                className="shrink-0 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all"
              >
                <span>Manage</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};
