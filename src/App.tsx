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
import { OrganizationTab } from './components/OrganizationTab';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { MemberDetailModal } from './components/MemberDetailModal';
import { Member, Organization, OrgMember, UserProfileExtended } from './types';
import { supabaseService } from './services/supabaseService';
import { setScoringConfig } from './lib/scoringEngine';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // App & Org State
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  
  const [org, setOrg] = useState<Organization | null>(() => {
    try {
      const cached = sessionStorage.getItem('bni_cached_org');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [orgMember, setOrgMember] = useState<OrgMember | null>(() => {
    try {
      const cached = sessionStorage.getItem('bni_cached_org_member');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfileExtended | null>(() => {
    try {
      const cached = sessionStorage.getItem('bni_cached_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isInitializing, setIsInitializing] = useState(() => !org);

  // Members & Selected Member
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. On Auth Load: Fetch Org & Profile with background revalidation & sessionStorage sync
  useEffect(() => {
    if (!user?.uid) {
      setIsInitializing(false);
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

        if (orgRes) {
          sessionStorage.setItem('bni_cached_org', JSON.stringify(orgRes.org));
          sessionStorage.setItem('bni_cached_org_member', JSON.stringify(orgRes.member));

          const [settingsRes, dbMembers] = await Promise.all([
            supabaseService.fetchOrgSettings(orgRes.org.id, user.uid),
            supabaseService.fetchMembers(orgRes.org.id),
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

          fetchedMembers = dbMembers;

          supabaseService.subscribeToMembers(orgRes.org.id, async () => {
            const fresh = await supabaseService.fetchMembers(orgRes.org.id);
            setMembers(fresh);
          });
        }

        if (profRes) {
          sessionStorage.setItem('bni_cached_profile', JSON.stringify(profRes));
        }

        if (orgRes) {
          setOrg(orgRes.org);
          setOrgMember(orgRes.member);
        }
        setUserProfile(profRes);
        setMembers(fetchedMembers);
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initUserData();
  }, [user]);

  // Handle Org Created / Joined
  const handleOrgJoined = (data: { org: Organization; member: OrgMember }) => {
    sessionStorage.setItem('bni_cached_org', JSON.stringify(data.org));
    sessionStorage.setItem('bni_cached_org_member', JSON.stringify(data.member));
    setOrg(data.org);
    setOrgMember(data.member);
    showToast(`Joined ${data.org.name}! Org Code: ${data.org.code}`, 'success');
  };

  // Handle Profile Completed
  const handleProfileCompleted = (profile: UserProfileExtended) => {
    sessionStorage.setItem('bni_cached_profile', JSON.stringify(profile));
    setUserProfile(profile);
    showToast('Profile completed successfully!', 'success');
  };

  // Member CRUD Handlers
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

  const handleImportMembers = async (imported: Member[]) => {
    if (org?.id && user?.uid) {
      setIsSyncing(true);
      setMembers(imported);
      showToast(`Importing ${imported.length} members to chapter database...`, 'info');
      await supabaseService.upsertMembers(imported, org.id, user.uid);
      const dbMembers = await supabaseService.fetchMembers(org.id);
      if (dbMembers && dbMembers.length > 0) {
        setMembers(dbMembers);
      }
      showToast(`Successfully imported ${imported.length} members!`, 'success');
      setIsSyncing(false);
    }
    setActiveTab('dashboard');
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    await supabaseService.deleteMember(memberId, org.id);
    showToast('Member removed from chapter DB', 'error');
    setIsSyncing(false);
  };

  const handlePurgeAll = async () => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers([]);
    await supabaseService.purgeAllMembers(org.id);
    showToast('All chapter member data purged from database', 'warning');
    setIsSyncing(false);
  };

  // Loading Screen
  if (authLoading || (isInitializing && !org)) {
    return (
      <div className="min-h-screen bg-[#060a12] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-400">Loading BNI Chapter Operations...</p>
        </div>
      </div>
    );
  }

  // 1. Not Authenticated -> Login Page
  if (!user) {
    return <LoginPage />;
  }

  // 2. Authenticated but NO Organization -> Org Onboarding Screen (6-Digit Code)
  if (!org) {
    return <OrgOnboardingScreen onOrgJoined={handleOrgJoined} />;
  }

  // 3. Has Org but Profile NOT Completed -> Profile Onboarding Screen
  if (!userProfile || !userProfile.is_profile_completed) {
    return <ProfileOnboardingScreen onProfileCompleted={handleProfileCompleted} />;
  }

  // 4. Fully Authenticated & Onboarded -> App with Sidebar Layout
  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      memberCount={members.length}
      org={org}
      orgMember={orgMember}
      userProfile={userProfile}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          members={members}
          onSelectMember={(m) => setSelectedMember(m)}
          onOpenImport={() => setActiveTab('import')}
          onOpenNudges={() => setActiveTab('nudges')}
          onSaveMember={handleSaveMember}
          onDeleteMember={handleDeleteMember}
          onPurgeAll={handlePurgeAll}
          isSyncing={isSyncing}
        />
      )}

      {activeTab === 'import' && (
        <div className="max-w-3xl mx-auto">
          <ImportModal
            onImportComplete={handleImportMembers}
            onClose={() => setActiveTab('dashboard')}
          />
        </div>
      )}

      {activeTab === 'nudges' && (
        <NudgeSender
          members={members}
          customSignature={org.custom_signature}
          orgId={org.id}
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
