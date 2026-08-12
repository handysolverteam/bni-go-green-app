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

export const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // App & Org State (Persisted in URL Hash & localStorage)
  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => {
    const hash = window.location.hash.replace('#', '') as NavigationTab;
    if (['dashboard', 'import', 'nudges', 'templates', 'org', 'profile', 'settings'].includes(hash)) {
      return hash;
    }
    const stored = localStorage.getItem('bni_active_tab') as NavigationTab;
    if (['dashboard', 'import', 'nudges', 'templates', 'org', 'profile', 'settings'].includes(stored)) {
      return stored;
    }
    return 'dashboard';
  });

  const setActiveTab = (tab: NavigationTab) => {
    setActiveTabState(tab);
    window.location.hash = tab;
    localStorage.setItem('bni_active_tab', tab);
  };
  
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
  const [selectedNudgeReport, setSelectedNudgeReport] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 1. On Auth Load: Fetch Org & Profile with background revalidation & localStorage sync
  useEffect(() => {
    if (!user?.uid) {
      setIsInitializing(false);
      setIsDataLoaded(true);
      return;
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

  // 1. Unauthenticated -> LoginPage (Only when auth check is complete)
  if (!user && !authLoading) {
    return <LoginPage />;
  }

  // 2. Authenticated but NO Organization -> Org Onboarding Screen
  // Only render when DB fetch is 100% complete and org is confirmed null
  if (user && isDataLoaded && !isInitializing && !org) {
    return <OrgOnboardingScreen onOrgJoined={handleOrgJoined} />;
  }

  // 3. Has Org but Profile NOT Completed -> Profile Onboarding Screen
  if (user && isDataLoaded && !isInitializing && org && (!userProfile || !userProfile.is_profile_completed)) {
    return <ProfileOnboardingScreen onProfileCompleted={handleProfileCompleted} />;
  }

  // 4. Default Guard if org not yet loaded
  if (!org) return null;

  // 4. Fully Authenticated & Onboarded -> App with Sidebar Layout
  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={(tab) => {
        if (tab !== 'nudges') setSelectedNudgeReport(null);
        setActiveTab(tab);
      }}
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
          onSelectMember={(m) => setSelectedMember(m)}
          onOpenImport={() => setActiveTab('import')}
          onOpenNudges={(reportName) => {
            setSelectedNudgeReport(reportName || null);
            setActiveTab('nudges');
          }}
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
          customSignature={org.custom_signature}
          orgId={org.id}
          onOpenTemplateManager={() => setActiveTab('templates')}
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
