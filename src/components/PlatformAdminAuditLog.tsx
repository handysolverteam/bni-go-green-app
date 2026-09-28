import React, { useEffect, useState } from 'react';
import { History, Loader2, UserCog, ShieldPlus, ShieldMinus, UserPlus2 } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { GlassCard } from './GlassCard';

type AuditRow = Awaited<ReturnType<typeof supabaseService.fetchPlatformAdminAuditLog>>[number];

const ACTION_META: Record<string, { label: string; icon: typeof UserCog }> = {
  org_member_update: { label: 'Changed a role', icon: UserCog },
  org_member_added: { label: 'Added a member', icon: UserPlus2 },
  platform_admin_granted: { label: 'Granted Platform Admin', icon: ShieldPlus },
  platform_admin_revoked: { label: 'Revoked Platform Admin', icon: ShieldMinus },
};

function describeDetail(action: string, detail: AuditRow['detail']): string {
  if (!detail) return '';
  switch (action) {
    case 'org_member_update': {
      const uid = detail.target_user_id as string | undefined;
      const before = detail.role_before as string | undefined;
      const after = detail.role_after as string | undefined;
      if (before !== after) return `${uid} — ${before} → ${after}`;
      const uidBefore = detail.user_id_before as string | undefined;
      const uidAfter = detail.user_id_after as string | undefined;
      if (uidBefore !== uidAfter) return `re-linked ${uidBefore} → ${uidAfter}`;
      return uid || '';
    }
    case 'org_member_added': {
      const email = (detail.target_user_email as string) || (detail.target_user_id as string) || '';
      const role = detail.role as string | undefined;
      const reroled = detail.was_reroled ? ' (already existed, role updated)' : '';
      return `${email} as ${role}${reroled}`;
    }
    case 'platform_admin_granted':
    case 'platform_admin_revoked':
      return (detail.target_user_id as string) || '';
    default:
      return JSON.stringify(detail);
  }
}

/** Every action a Platform Admin has taken outside their own chapter — logged server-side, see migration 010. */
export const PlatformAdminAuditLog: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabaseService.fetchPlatformAdminAuditLog().then(res => {
      setRows(res);
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center space-x-2.5">
        <History className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Audit Log</h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Role changes and members added by a Platform Admin, across every chapter. Most recent first.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">No Platform Admin actions logged yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const meta = ACTION_META[row.action] ?? { label: row.action, icon: History };
            const Icon = meta.icon;
            return (
              <GlassCard key={row.id} className="p-3.5 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {meta.label}
                    {row.org_name && <span className="font-normal text-slate-500"> in {row.org_name}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{describeDetail(row.action, row.detail)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {row.actor_email || row.actor_uid} &middot; {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
