import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ImportModal } from './components/ImportModal';
import { NudgeSender } from './components/NudgeSender';
import { MemberDetailModal } from './components/MemberDetailModal';
import { SettingsPage } from './components/SettingsPage';
import { Member } from './types';
import { scoreMember } from './lib/scoringEngine';
import { supabaseService } from './services/supabaseService';

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'import' | 'nudges' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Initial Load & Realtime Sync with Supabase
  useEffect(() => {
    if (!user?.uid) return;

    const loadData = async () => {
      setIsSyncing(true);
      const dbMembers = await supabaseService.fetchMembers(user.uid);
      if (dbMembers.length > 0) {
        setMembers(dbMembers);
      } else {
        // Local storage fallback if DB is empty
        const saved = localStorage.getItem(`bni_members_${user.uid}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const scored = parsed.map((m: Member) => scoreMember(m));
            setMembers(scored);
            await supabaseService.upsertMembers(scored, user.uid);
          } catch (e) {
            console.error('Failed to parse local storage:', e);
          }
        }
      }
      setIsSyncing(false);
    };

    loadData();

    // Subscribe to realtime Supabase changes
    const unsubscribe = supabaseService.subscribeToMembers(user.uid, () => {
      loadData();
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Save to local storage cache on member updates
  useEffect(() => {
    if (user?.uid && members.length > 0) {
      localStorage.setItem(`bni_members_${user.uid}`, JSON.stringify(members));
    }
  }, [members, user]);

  // Handle Excel Import
  const handleImportMembers = async (imported: Member[]) => {
    setMembers(imported);
    if (user?.uid) {
      await supabaseService.upsertMembers(imported, user.uid);
    }
    setActiveTab('dashboard');
  };

  // Handle Delete Member
  const handleDeleteMember = async (memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    if (user?.uid) {
      await supabaseService.deleteMember(memberId, user.uid);
    }
  };

  // Handle Purge All Members
  const handlePurgeAll = async () => {
    setMembers([]);
    if (user?.uid) {
      await supabaseService.purgeAllMembers(user.uid);
      localStorage.removeItem(`bni_members_${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a12] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-400">Authenticating Director Session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 pb-16 antialiased">
      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        memberCount={members.length}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            members={members}
            onSelectMember={(m) => setSelectedMember(m)}
            onOpenImport={() => setActiveTab('import')}
            onOpenNudges={() => setActiveTab('nudges')}
            onDeleteMember={handleDeleteMember}
            onPurgeAll={handlePurgeAll}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === 'import' && (
          <div className="max-w-3xl mx-auto pt-2">
            <ImportModal
              onImportComplete={handleImportMembers}
              onClose={() => setActiveTab('dashboard')}
            />
          </div>
        )}

        {activeTab === 'nudges' && (
          <NudgeSender members={members} />
        )}

        {activeTab === 'settings' && (
          <SettingsPage />
        )}
      </main>

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
