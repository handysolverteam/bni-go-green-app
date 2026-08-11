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

// Default initial sample members if local storage is empty
const INITIAL_MEMBERS: Member[] = [
  scoreMember({ Name: "Rajesh Sharma", Phone: "9876543210", P: 24, A: 2, RGT: 18, V: 4, TYFCB: 1250000, CEU: 15, OneToOnes: 12, Sponsors: 1 }),
  scoreMember({ Name: "Priya Patel", Phone: "9812345678", P: 22, A: 4, RGT: 10, V: 2, TYFCB: 450000, CEU: 8, OneToOnes: 8, Sponsors: 0 }),
  scoreMember({ Name: "Amit Kumar", Phone: "9988776655", P: 18, A: 8, RGT: 5, V: 1, TYFCB: 100000, CEU: 2, OneToOnes: 4, Sponsors: 0 }),
  scoreMember({ Name: "Vikram Malhotra", Phone: "9765432109", P: 14, A: 12, RGT: 2, V: 0, TYFCB: 25000, CEU: 0, OneToOnes: 1, Sponsors: 0 }),
];

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'import' | 'nudges' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('bni_members');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((m: Member) => scoreMember(m));
      } catch (e) {
        console.error('Failed to parse saved members:', e);
      }
    }
    return INITIAL_MEMBERS;
  });

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    localStorage.setItem('bni_members', JSON.stringify(members));
  }, [members]);

  const handleImportMembers = (newMembers: Member[]) => {
    setMembers(newMembers);
    setActiveTab('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d19] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-400">Loading BNI Go Green App...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#080d19] text-slate-100 pb-16">
      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        memberCount={members.length}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            members={members}
            onSelectMember={(m) => setSelectedMember(m)}
            onOpenImport={() => setActiveTab('import')}
            onOpenNudges={() => setActiveTab('nudges')}
          />
        )}

        {activeTab === 'import' && (
          <div className="max-w-3xl mx-auto pt-4">
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

      {/* Member Detailed Modal */}
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
