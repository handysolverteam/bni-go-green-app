import React, { useEffect, useState } from 'react';
import { Building2, Search, Users, ArrowRight, Loader2, Crown, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { Organization } from '../types';
import { GlassCard } from './GlassCard';
import { UniversalModal } from './UniversalModal';
import { useToast } from '../context/ToastContext';

interface PlatformAdminOrgsProps {
  onManage: (org: Organization) => void;
}

type AdminOrg = Organization & { member_count: number };

/**
 * Every organization on the platform, for a Platform Admin to jump into. This is the ONLY
 * cross-chapter view in the app -- everything else stays scoped to one org, on purpose (the
 * per-chapter isolation is enforced server-side; this component works only because RLS lets
 * a Platform Admin's caller_org_ids() include every org -- see migration 009).
 *
 * Removing a chapter here archives it (migration 013): it stops accepting joins and is hidden
 * from members, but nothing is destroyed and it can be restored from this same list.
 */
export const PlatformAdminOrgs: React.FC<PlatformAdminOrgsProps> = ({ onManage }) => {
  const { showToast } = useToast();
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Removal is gated on typing the chapter's name -- a plain "are you sure?" is too easy to
  // click through for something that takes a whole chapter offline for its members.
  const [removeTarget, setRemoveTarget] = useState<AdminOrg | null>(null);
  const [typedName, setTypedName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [removeError, setRemoveError] = useState('');

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

  const setArchived = async (org: AdminOrg, archived: boolean) => {
    setIsSaving(true);
    setRemoveError('');
    try {
      await supabaseService.setOrganizationArchived(org.id, archived);
      setOrgs(prev =>
        prev.map(o => (o.id === org.id ? { ...o, archived_at: archived ? new Date().toISOString() : null } : o)),
      );
      showToast(
        archived
          ? `${org.chapter_name || org.name} removed. It can be restored from this list.`
          : `${org.chapter_name || org.name} restored.`,
        'success',
      );
      setRemoveTarget(null);
      setTypedName('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update that chapter.';
      // The dialog's overlay can cover the toast, so show the reason inside the dialog too.
      setRemoveError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const targetName = removeTarget ? removeTarget.chapter_name || removeTarget.name : '';
  const nameMatches = typedName.trim() === targetName.trim() && targetName.length > 0;

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
          {filtered.map(org => {
            const isArchived = Boolean(org.archived_at);
            return (
              <GlassCard
                key={org.id}
                className={`p-3.5 flex items-center justify-between gap-3 ${isArchived ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${
                    isArchived ? 'bg-slate-500/10 text-slate-400' : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                      <span className="truncate">{org.chapter_name || org.name}</span>
                      {isArchived && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase border border-rose-500/30">
                          Removed
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>Code: {org.code}</span>
                      <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{org.member_count}</span>
                      {org.city && <span>{org.city}</span>}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isArchived ? (
                    <button
                      onClick={() => setArchived(org, false)}
                      disabled={isSaving}
                      className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onManage(org)}
                        className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all"
                      >
                        <span>Manage</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setRemoveTarget(org); setTypedName(''); setRemoveError(''); }}
                        title="Remove this chapter (reversible)"
                        className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-500/25 flex items-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {removeTarget && (
        <UniversalModal
          isOpen={!!removeTarget}
          onClose={() => { if (!isSaving) { setRemoveTarget(null); setTypedName(''); setRemoveError(''); } }}
          title="Remove chapter"
          icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              This takes <strong className="text-slate-900 dark:text-white">{targetName}</strong> offline for its{' '}
              <strong className="text-slate-900 dark:text-white">{removeTarget.member_count}</strong> member
              {removeTarget.member_count === 1 ? '' : 's'}. The chapter stops accepting its invite code and
              disappears for everyone in it.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
              Nothing is deleted — the roster, imports and history are kept, and you can restore the chapter
              from this list at any time.
            </p>

            <label className="block">
              <span className="text-[11px] font-bold uppercase text-slate-500">
                Type <span className="text-slate-900 dark:text-white">{targetName}</span> to confirm
              </span>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoFocus
                className="mt-1.5 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 text-sm text-slate-900 dark:text-white"
              />
            </label>

            {removeError && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 p-2.5 rounded-xl border border-rose-200 dark:border-rose-500/20">
                {removeError}
              </p>
            )}

            <div className="flex justify-end space-x-2 pt-1">
              <button
                onClick={() => { setRemoveTarget(null); setTypedName(''); setRemoveError(''); }}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => setArchived(removeTarget, true)}
                disabled={isSaving || !nameMatches}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Remove chapter</span>
              </button>
            </div>
          </div>
        </UniversalModal>
      )}
    </div>
  );
};
