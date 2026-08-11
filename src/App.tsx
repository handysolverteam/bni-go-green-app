import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
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

  // App & Org State
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgMember, setOrgMember] = useState<OrgMember | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileExtended | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Members & Selected Member
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. On Auth Load: Fetch Org & User Profile
  useEffect(() => {
    if (!user?.uid) {
      setIsInitializing(false);
      return;
    }

    const initUserData = async () => {
      setIsInitializing(true);

      // Fetch Org
      const orgRes = await supabaseService.fetchUserOrganization(user.uid);
      if (orgRes) {
        setOrg(orgRes.org);
        setOrgMember(orgRes.member);

        // Fetch custom org settings from Supabase DB
        const settingsRes = await supabaseService.fetchOrgSettings(orgRes.org.id, user.uid);
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

        // Fetch Org Members
        const dbMembers = await supabaseService.fetchMembers(orgRes.org.id);
        setMembers(dbMembers);

        // Subscribe to realtime members
        supabaseService.subscribeToMembers(orgRes.org.id, async () => {
          const fresh = await supabaseService.fetchMembers(orgRes.org.id);
          setMembers(fresh);
        });
      }

      // Fetch Profile
      const profRes = await supabaseService.fetchUserProfile(user.uid);
      setUserProfile(profRes);

      setIsInitializing(false);
    };

    initUserData();
  }, [user]);

  // Handle Org Created / Joined
  const handleOrgJoined = (data: { org: Organization; member: OrgMember }) => {
    setOrg(data.org);
    setOrgMember(data.member);
  };

  // Handle Profile Completed
  const handleProfileCompleted = (profile: UserProfileExtended) => {
    setUserProfile(profile);
  };

  // Member CRUD Handlers
  const handleSaveMember = async (memberToSave: Member) => {
    if (!org?.id || !user?.uid) return;
    setIsSyncing(true);
    const saved = await supabaseService.saveSingleMember(memberToSave, org.id, user.uid);
    if (saved) {
      const dbMembers = await supabaseService.fetchMembers(org.id);
      setMembers(dbMembers);
    }
    setIsSyncing(false);
  };

  const handleImportMembers = async (imported: Member[]) => {
    if (org?.id && user?.uid) {
      setIsSyncing(true);
      // 1. Immediate optimistic UI render
      setMembers(imported);
      
      // 2. Persist batch to Supabase Postgres
      await supabaseService.upsertMembers(imported, org.id, user.uid);
      
      // 3. Re-fetch fresh DB records
      const dbMembers = await supabaseService.fetchMembers(org.id);
      if (dbMembers && dbMembers.length > 0) {
        setMembers(dbMembers);
      }
      setIsSyncing(false);
    }
    setActiveTab('dashboard');
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    await supabaseService.deleteMember(memberId, org.id);
    setIsSyncing(false);
  };

  const handlePurgeAll = async () => {
    if (!org?.id) return;
    setIsSyncing(true);
    setMembers([]);
    await supabaseService.purgeAllMembers(org.id);
    setIsSyncing(false);
  };

  // Loading Screen
  if (authLoading || isInitializing) {
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
        <NudgeSender members={members} />
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
