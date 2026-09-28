import React, { useEffect, useState } from 'react';
import { Crown, Search, Loader2, UserMinus, ShieldPlus } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useToast } from '../context/ToastContext';
import { GlassCard } from './GlassCard';

interface PlatformAdminEntry {
  user_id: string;
  email: string | null;
  full_name: string | null;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
}

/**
 * Grant/revoke Platform Admin. There is deliberately no way to browse "everyone" here -- the
 * search below only finds accounts that already signed in to Handychapter at least once
 * (admin_grant_platform_admin refuses anything else), so this can't be used to grant power to
 * an account that has never existed. Every grant/revoke is logged (see the Audit Log tab).
 */
export const PlatformAdminsTab: React.FC = () => {
  const { showToast } = useToast();
  const [admins, setAdmins] = useState<PlatformAdminEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Array<{ user_id: string; user_email: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const loadAdmins = () => supabaseService.fetchPlatformAdmins().then(setAdmins);

  useEffect(() => {
    loadAdmins().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (search.trim().length < 3) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const handle = setTimeout(() => {
      supabaseService.searchUsersByEmail(search).then(res => {
        setResults(res.filter(r => !admins.some(a => a.user_id === r.user_id)));
        setIsSearching(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, admins]);

  const handleGrant = async (userId: string, email: string) => {
    setPendingUserId(userId);
    try {
      await supabaseService.grantPlatformAdmin(userId);
      showToast(`${email} is now a Platform Admin.`, 'success');
      setSearch('');
      setResults([]);
      await loadAdmins();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to grant Platform Admin.', 'error');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRevoke = async (userId: string, label: string) => {
    if (!window.confirm(`Remove Platform Admin from ${label}? They will immediately lose access to every organization except their own.`)) return;
    setPendingUserId(userId);
    try {
      await supabaseService.revokePlatformAdmin(userId);
      showToast(`${label} is no longer a Platform Admin.`, 'success');
      await loadAdmins();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to revoke Platform Admin.', 'error');
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center space-x-2.5">
        <Crown className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Platform Admins</h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        A Platform Admin can view and manage every organization, not just their own. Grant this rarely.
      </p>

      <GlassCard className="p-4 space-y-3">
        <h3 className="text-xs font-black uppercase text-slate-500">Grant to someone new</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email (must have signed in before)..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />}
        </div>
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map(r => (
              <div key={r.user_id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{r.user_email}</span>
                <button
                  onClick={() => handleGrant(r.user_id, r.user_email)}
                  disabled={pendingUserId === r.user_id}
                  className="shrink-0 ml-2 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-black flex items-center gap-1 disabled:opacity-60"
                >
                  {pendingUserId === r.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldPlus className="w-3 h-3" />}
                  <span>Grant</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {search.trim().length >= 3 && !isSearching && results.length === 0 && (
          <p className="text-[11px] text-slate-400">No matching account has signed in to Handychapter before.</p>
        )}
      </GlassCard>

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase text-slate-500 px-1">Currently granted ({admins.length})</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          admins.map(a => (
            <GlassCard key={a.user_id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {a.full_name || a.email || a.user_id}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {a.email} &middot; granted {new Date(a.granted_at).toLocaleDateString()}
                  {a.note ? ` — ${a.note}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(a.user_id, a.email || a.user_id)}
                disabled={pendingUserId === a.user_id}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-black flex items-center gap-1 border border-rose-500/20 disabled:opacity-60"
              >
                {pendingUserId === a.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                <span>Revoke</span>
              </button>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
};
