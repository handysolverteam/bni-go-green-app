import React, { useState } from 'react';
import { Building2, Crown, History } from 'lucide-react';
import { Organization } from '../types';
import { PlatformAdminOrgs } from './PlatformAdminOrgs';
import { PlatformAdminsTab } from './PlatformAdminsTab';
import { PlatformAdminAuditLog } from './PlatformAdminAuditLog';

type Tab = 'orgs' | 'admins' | 'log';

const TABS: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
  { id: 'orgs', label: 'Organizations', icon: Building2 },
  { id: 'admins', label: 'Platform Admins', icon: Crown },
  { id: 'log', label: 'Audit Log', icon: History },
];

interface PlatformAdminPanelProps {
  onManageOrg: (org: Organization) => void;
}

/** The three Platform-Admin-only screens, in one tabbed panel -- see App.tsx for where this mounts. */
export const PlatformAdminPanel: React.FC<PlatformAdminPanelProps> = ({ onManageOrg }) => {
  const [tab, setTab] = useState<Tab>('orgs');

  return (
    <div>
      <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-slate-200 dark:border-white/10">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 -mb-px flex items-center gap-1.5 text-xs font-black border-b-2 transition-all ${
                active
                  ? 'border-amber-500 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'orgs' && <PlatformAdminOrgs onManage={onManageOrg} />}
      {tab === 'admins' && <PlatformAdminsTab />}
      {tab === 'log' && <PlatformAdminAuditLog />}
    </div>
  );
};
