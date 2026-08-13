import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { LoginPage } from './components/LoginPage';
import { OrgOnboardingScreen } from './components/OrgOnboardingScreen';
import { ProfileOnboardingScreen } from './components/ProfileOnboardingScreen';
import { SidebarLayout, NavigationTab } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ImportModal } from './components/ImportModal';
import { NudgeSender } from './components/NudgeSender';
import { TemplateManagerPage } from './components/TemplateManagerPage';
import { OrganizationTab } from './components/OrganizationTab';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { MemberDetailModal } from './components/MemberDetailModal';
import { Member, Organization, OrgMember, UserProfileExtended, ImportLog } from './types';
import { supabaseService } from './services/supabaseService';
import { setScoringConfig, scoreMember } from './lib/scoringEngine';

const parseHash = () => {
  const raw = decodeURIComponent(window.location.hash.replace('#', ''));
  if (!raw) return { tab: 'dashboard' as NavigationTab, report: null };
  const parts = raw.split('/');
  const mainTab = parts[0] as NavigationTab;
  const subReport = parts.slice(1).join('/');

  let reportName: string | null = null;
  if (subReport) {
    reportName = subReport.startsWith('report/') ? subReport.replace('report/', '') : subReport;
  }

  const validTabs: NavigationTab[] = ['dashboard', 'import', 'nudges', 'templates', 'org', 'profile', 'settings'];
  if (validTabs.includes(mainTab)) {
    return { tab: mainTab, report: ['dashboard', 'nudges'].includes(mainTab) ? (reportName || null) : null };
  }
  return { tab: 'dashboard' as NavigationTab, report: null };
};

export const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const hasVerifiedRef = React.useRef(false);

  // App & Org State (Persisted in URL Hash & localStorage)
  const initialNav = parseHash();
  const [activeTab, setActiveTabState] = useState<NavigationTab>(initialNav.tab);
  const [selectedNudgeReport, setSelectedNudgeReportState] = useState<string | null>(initialNav.report);

  const navigateTo = (tab: NavigationTab, reportName: string | null = null) => {
    let newHash = `#${tab}`;
    if (reportName && ['dashboard', 'nudges'].includes(tab)) {
      newHash = `#${tab}/report/${encodeURIComponent(reportName)}`;
    }
    if (window.location.hash !== newHash) {
      window.history.pushState({ tab, report: reportName }, '', newHash);
    }
    setActiveTabState(tab);
    setSelectedNudgeReportState(reportName);
    localStorage.setItem('bni_active_tab', tab);
    if (reportName) {
      localStorage.setItem('bni_active_report', reportName);
    } else {
      localStorage.removeItem('bni_active_report');
    }
  };

  const setActiveTab = (tab: NavigationTab) => {
    navigateTo(tab, null);
  };

  // Listen to mobile swipe-back gesture and browser back/forward buttons & hash changes
  useEffect(() => {
    const handleSyncFromHash = () => {
      const { tab, report } = parseHash();
      setActiveTabState(tab);
      setSelectedNudgeReportState(report);
    };

    window.addEventListener('popstate', handleSyncFromHash);
    window.addEventListener('hashchange', handleSyncFromHash);
    return () => {
      window.removeEventListener('popstate', handleSyncFromHash);
      window.removeEventListener('hashchange', handleSyncFromHash);
    };
  }, []);
  
  const [org, setOrg] = useState<Organization | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_org');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [orgMember, setOrgMember] = useState<OrgMember | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_org_member');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfileExtended | null>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);

  // Members, Import Logs & Selected Member (Hydrated instantly from SWR localStorage)
  const [members, setMembersState] = useState<Member[]>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_members');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [importLogs, setImportLogsState] = useState<ImportLog[]>(() => {
    try {
      const cached = localStorage.getItem('bni_cached_import_logs');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const setMembers = (mems: Member[] | ((prev: Member[]) => Member[])) => {
    setMembersState((prev) => {
      const next = typeof mems === 'function' ? mems(prev) : mems;
      try { localStorage.setItem('bni_cached_members', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const setImportLogs = (logs: ImportLog[] | ((prev: ImportLog[]) => ImportLog[])) => {
    setImportLogsState((prev) => {
      const next = typeof logs === 'function' ? logs(prev) : logs;
      try { localStorage.setItem('bni_cached_import_logs', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 1. On Auth Load: Fetch Org & Profile with background revalidation & localStorage sync
  useEffect(() => {
    if (!user?.uid) {
      setIsInitializing(false);
      setIsDataLoaded(true);
      return;
    }

    if (!hasVerifiedRef.current) {
      setIsInitializing(true);
      setIsDataLoaded(false);
    }

    const initUserData = async () => {
      try {
        // Fetch Org and User Profile concurrently
        const [orgRes, profRes] = await Promise.all([
          supabaseService.fetchUserOrganization(user.uid),
          supabaseService.fetchUserProfile(user.uid),
        ]);

        let fetchedMembers: Member[] = [];
        let fetchedLogs: ImportLog[] = [];

        if (orgRes) {
          localStorage.setItem('bni_cached_org', JSON.stringify(orgRes.org));
          localStorage.setItem('bni_cached_org_member', JSON.stringify(orgRes.member));

          const [settingsRes, dbMembers, dbLogs] = await Promise.all([
            supabaseService.fetchOrgSettings(orgRes.org.id, user.uid),
            supabaseService.fetchMembers(orgRes.org.id),
            supabaseService.fetchImportLogs(orgRes.org.id),
          ]);

          if (settingsRes && settingsRes.scoringConfig) {
            setScoringConfig(settingsRes.scoringConfig);
          } else {
            setScoringConfig({
              trafficLight: {
                green: orgRes.org.green_threshold || 70,
                amber: orgRes.org.amber_threshold || 50,
                red: orgRes.org.red_threshold || 30,
              }
            });
          }

          // Re-score fetched members with active custom org scoring configuration
          fetchedMembers = dbMembers.map(m => scoreMember(m));
          fetchedLogs = dbLogs;

          supabaseService.subscribeToMembers(orgRes.org.id, async () => {
            const fresh = await supabaseService.fetchMembers(orgRes.org.id);
            setMembers(fresh);
          });
        }

        if (profRes) {
          localStorage.setItem('bni_cached_profile', JSON.stringify(profRes));
        } else {
          localStorage.removeItem('bni_cached_profile');
        }

        if (orgRes) {
          localStorage.setItem('bni_cached_org', JSON.stringify(orgRes.org));
          localStorage.setItem('bni_cached_org_member', JSON.stringify(orgRes.member));
          setOrg(orgRes.org);
          setOrgMember(orgRes.member);
        } else {
          localStorage.removeItem('bni_cached_org');
          localStorage.removeItem('bni_cached_org_member');
          setOrg(null);
          setOrgMember(null);
        }

        setUserProfile(profRes);
        setMembers(fetchedMembers);
        setImportLogs(fetchedLogs);
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        hasVerifiedRef.current = true;
        setIsInitializing(false);
        setIsDataLoaded(true);
      }
    };

    initUserData();
  }, [user]);

  // Handle Org Created / Joined
  const handleOrgJoined = (data: { org: Organization; member: OrgMember }) => {
    localStorage.setItem('bni_cached_org', JSON.stringify(data.org));
    localStorage.setItem('bni_cached_org_member', JSON.stringify(data.member));
    setOrg(data.org);
    setOrgMember(data.member);
    showToast(`Joined ${data.org.name}! Org Code: ${data.org.code}`, 'success');
  };

  // Handle Profile Completed
  const handleProfileCompleted = (profile: UserProfileExtended) => {
    localStorage.setItem('bni_cached_profile', JSON.stringify(profile));
    setUserProfile(profile);
    showToast('Profile completed successfully!', 'success');
  };

  // Member & Batch CRUD Handlers
  const handleSaveMember = async (memberToSave: Member) => {
    if (!org?.id || !user?.uid) return;
    setIsSyncing(true);
    const saved = await supabaseService.saveSingleMember(memberToSave, org.id, user.uid);
    if (saved) {
      const dbMembers = await supabaseService.fetchMembers(org.id);
      setMembers(dbMembers);
      showToast(`Member "${memberToSave.Name}" saved!`, 'success');
    } else {
      showToast('Failed to save member to database', 'error');
    }
    setIsSyncing(false);
  };

  const handleImportMembers = async (batchName: string, imported: Member[], fileName: string, fileData?: string) => {
    setActiveTab('dashboard'); // Auto-close import modal immediately!
    if (org?.id && user?.uid) {
      // 1. INSTANT OPTIMISTIC UI RENDER (0ms LATENCY! Report card shows immediately without refresh!)
      const newLog: ImportLog = {
        id: `log_${Date.now()}`,
        org_id: org.id,
        user_id: user.uid,
        file_name: fileName,
        batch_name: batchName,
        total_records: imported.length,
        green_count: imported.filter(m => m.trafficLight?.label === 'Green').length,
        amber_count: imported.filter(m => m.trafficLight?.label === 'Amber').length,
        red_count: imported.filter(m => m.trafficLight?.label === 'Red').length,
        grey_count: imported.filter(m => m.trafficLight?.label === 'Grey').length,
        avg_score: imported.length > 0 ? Math.round(imported.reduce((acc, m) => acc + (m.score || 0), 0) / imported.length) : 0,
        file_data: fileData || '',
        created_at: new Date().toISOString(),
      };

      // Build lookup map of existing member phone numbers & join dates by name
      const existingMap = new Map<string, { phone: string; joinDate: string }>();
      members.forEach(m => {
        if (m.Name) {
          existingMap.set(m.Name.trim().toLowerCase(), {
            phone: m.Phone || '',
            joinDate: m.JoinDate || (m as any).join_date || '',
          });
        }
      });

      const taggedMembers = imported.map((m, idx) => {
        const norm = (m.Name || '').trim().toLowerCase();
        const prev = existingMap.get(norm);
        return scoreMember({
          ...m,
          Phone: m.Phone || prev?.phone || '',
          JoinDate: m.JoinDate || prev?.joinDate || '',
          id: m.id || `temp_${Date.now()}_${idx}`,
          batch_name: batchName,
          org_id: org.id,
        });
      });

      // Render new report card & members ON SCREEN IMMEDIATELY
      setImportLogs(prev => [newLog, ...prev.filter(l => l.batch_name !== batchName)]);
      setMembers(prev => [...prev.filter(m => m.batch_name !== batchName), ...taggedMembers]);

      showToast(`Successfully imported report "${batchName}" with ${imported.length} members!`, 'success');

      // 2. Background database save & sync
      setIsSyncing(true);
      const success = await supabaseService.upsertMembers(taggedMembers, org.id, user.uid, fileName, batchName, fileData);

      // Revalidate with fresh DB IDs
      const [dbMembers, dbLogs] = await Promise.all([
        supabaseService.fetchMembers(org.id),
        supabaseService.fetchImportLogs(org.id),
      ]);

      if (dbMembers && dbMembers.length > 0) setMembers(dbMembers);
      if (dbLogs && dbLogs.length > 0) setImportLogs(dbLogs);

      setIsSyncing(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    await supabaseService.deleteMember(memberId, org.id);
    showToast('Member successfully removed from database', 'info');
    setIsSyncing(false);
  };

  const handleDeleteBatch = async (batchName: string, logId?: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    await supabaseService.deleteImportBatch(org.id, batchName, logId);
    const [dbMembers, dbLogs] = await Promise.all([
      supabaseService.fetchMembers(org.id),
      supabaseService.fetchImportLogs(org.id),
    ]);
    setMembers(dbMembers);
    setImportLogs(dbLogs);
    showToast(`Batch "${batchName}" and its members removed from database!`, 'warning');
    setIsSyncing(false);
  };

  const handlePurgeAll = async () => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers([]);
    setImportLogs([]);
    await supabaseService.purgeAllMembers(org.id);
    showToast('All chapter member data purged from database', 'warning');
    setIsSyncing(false);
  };

  // 1. Unauthenticated / Login Process -> Always show LoginPage
  if (!user) {
    return <LoginPage />;
  }

  // 2. User is Logged In (user != null) but Org Verification is in progress -> Verifying Splash
  if (isInitializing || !isDataLoaded) {
    const isLight = localStorage.getItem('bni_theme_mode') === 'light' || document.body.classList.contains('light-mode');
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4 transition-colors ${
        isLight ? 'bg-[#f1f5f9] text-slate-900' : 'bg-[#080d19] text-white'
      }`}>
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] animate-pulse shadow-lg shadow-emerald-500/20">
            <div className={`w-full h-full rounded-[14px] flex items-center justify-center ${
              isLight ? 'bg-white' : 'bg-[#080d19]'
            }`}>
              <img src="/icons/icon.svg" alt="BNI Go Green Logo" className="w-10 h-10 rounded-xl object-cover" />
            </div>
          </div>
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />
        </div>
        <div className="space-y-1">
          <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>Verifying Organization...</h3>
          <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Checking chapter membership & credentials</p>
        </div>
      </div>
    );
  }

  // 3. Authenticated & Verified, but NO Organization -> Org Onboarding Screen
  if (!org) {
    return <OrgOnboardingScreen onOrgJoined={handleOrgJoined} />;
  }

  // 4. Authenticated & Verified, Has Org, but Profile NOT Completed -> Profile Onboarding Screen
  if (!userProfile || !userProfile.is_profile_completed) {
    return <ProfileOnboardingScreen onProfileCompleted={handleProfileCompleted} />;
  }

  // 4. Fully Authenticated & Onboarded -> App with Sidebar Layout
  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={(tab) => navigateTo(tab)}
      memberCount={members.length}
      reportCount={importLogs.length}
      org={org}
      orgMember={orgMember}
      userProfile={userProfile}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          members={members}
          importLogs={importLogs}
          selectedReportName={selectedNudgeReport}
          onSelectReportName={(repName) => navigateTo('dashboard', repName)}
          onSelectMember={(m) => setSelectedMember(m)}
          onOpenImport={() => navigateTo('import')}
          onOpenNudges={(reportName) => navigateTo('nudges', reportName)}
          onSaveMember={handleSaveMember}
          onDeleteMember={handleDeleteMember}
          onDeleteBatch={handleDeleteBatch}
          onPurgeAll={handlePurgeAll}
          isSyncing={isSyncing}
          isInitialLoading={isInitializing}
          isDataLoaded={isDataLoaded}
        />
      )}

      {activeTab === 'import' && (
        <div className="max-w-3xl mx-auto">
          <ImportModal
            existingBatchNames={importLogs.map(l => l.batch_name).filter((b): b is string => Boolean(b))}
            onImportComplete={handleImportMembers}
            onClose={() => setActiveTab('dashboard')}
          />
        </div>
      )}

      {activeTab === 'nudges' && (
        <NudgeSender
          members={members}
          importLogs={importLogs}
          initialReportName={selectedNudgeReport}
          onSelectReportName={(repName) => navigateTo('nudges', repName)}
          customSignature={org.custom_signature}
          orgId={org.id}
          onOpenTemplateManager={() => navigateTo('templates')}
        />
      )}

      {activeTab === 'templates' && (
        <TemplateManagerPage
          orgId={org.id}
          onSelectTemplate={() => setActiveTab('nudges')}
        />
      )}

      {activeTab === 'org' && (
        <OrganizationTab
          org={org}
          orgMember={orgMember}
        />
      )}

      {activeTab === 'profile' && (
        <ProfilePage
          profile={userProfile}
          org={org}
          orgMember={orgMember}
          onProfileUpdated={(updated) => setUserProfile(updated)}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsPage
          orgId={org.id}
          onSettingsSaved={() => {
            setMembers(prev => prev.map(m => scoreMember(m)));
          }}
        />
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </SidebarLayout>
  );
};

export default function App() {
  return <AppContent />;
}
