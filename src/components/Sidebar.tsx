import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Upload, MessageSquare, Settings, LogOut, ShieldCheck, Building2, User, Menu, X, ChevronRight, Copy, Check } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { Organization, OrgMember, UserProfileExtended } from '../types';

export type NavigationTab = 'dashboard' | 'import' | 'nudges' | 'org' | 'profile' | 'settings';

interface SidebarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  memberCount: number;
  org: Organization | null;
  orgMember: OrgMember | null;
  userProfile: UserProfileExtended | null;
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  memberCount,
  org,
  orgMember,
  userProfile,
  children,
}) => {
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const isAdminOrOwner = orgMember?.role === 'owner' || orgMember?.role === 'admin';

  const handleCopyCode = () => {
    if (org?.code) {
      navigator.clipboard.writeText(org.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const navItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3, badge: memberCount > 0 ? memberCount : null },
    { id: 'import' as NavigationTab, label: 'Import PALMS', icon: Upload, adminOnly: true },
    { id: 'nudges' as NavigationTab, label: 'Outreach Nudges', icon: MessageSquare },
    { id: 'org' as NavigationTab, label: 'Organization', icon: Building2, subtitle: org?.code ? `Code: ${org.code}` : undefined },
    { id: 'profile' as NavigationTab, label: 'My Profile', icon: User },
    { id: 'settings' as NavigationTab, label: 'Settings', icon: Settings, adminOnly: true },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#060a12] text-slate-100 antialiased">
      {/* --- DESKTOP SIDEBAR (240px) --- */}
      <aside className="hidden lg:flex flex-col w-64 glass-panel border-r border-white/10 p-5 fixed top-0 bottom-0 z-40 overflow-y-auto">
        {/* Brand */}
        <div className="flex items-center space-x-3 pb-6 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 flex-shrink-0">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                BNI
              </span>
            </div>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-base font-extrabold text-white tracking-wide truncate">Go Green</h1>
            <p className="text-[11px] text-emerald-400 font-semibold truncate">{org?.name || 'Chapter Portal'}</p>
          </div>
        </div>

        {/* Org 6-Digit Code Widget */}
        {org?.code && (
          <div className="my-4 p-3 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between text-xs">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Org Code</div>
              <div className="font-black text-emerald-400 tracking-wider text-sm">{org.code}</div>
            </div>
            <button
              onClick={handleCopyCode}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy 6-digit invite code"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 py-2">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdminOrOwner) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${isActive ? 'bg-slate-950 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          {user && (
            <div className="flex items-center space-x-3 p-2 rounded-xl bg-slate-900/60 border border-white/5">
              {user.photoURL ? (
                <img src={user.photoURL} alt={userProfile?.full_name || 'User'} className="w-8 h-8 rounded-full ring-2 ring-emerald-500/40" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/40">
                  {(userProfile?.full_name || user.displayName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden flex-1 text-left">
                <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                  <span>{userProfile?.full_name || user.displayName}</span>
                </div>
                <div className="text-[10px] text-slate-400 capitalize font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{orgMember?.role || 'Member'}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-2 px-3 rounded-xl bg-slate-900/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 text-xs font-bold flex items-center justify-center space-x-2 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* --- MOBILE HEADER & DRAWER (<1024px) --- */}
      <header className="lg:hidden sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3" onClick={() => setActiveTab('dashboard')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
                <span className="text-base font-black text-emerald-400">BNI</span>
              </div>
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white">Go Green</h1>
              <p className="text-[10px] text-emerald-400 font-semibold">{org?.name || 'Chapter'}</p>
            </div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-slate-900/60 text-slate-300 border border-white/10"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="pt-3 pb-2 space-y-2 border-t border-white/10 mt-3 animate-fadeIn">
            {navItems.map((item) => {
              if (item.adminOnly && !isAdminOrOwner) return null;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === item.id ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[10px]">{item.badge}</span>}
                </button>
              );
            })}

            <button
              onClick={() => { setMobileMenuOpen(false); setShowLogoutConfirm(true); }}
              className="w-full py-2.5 px-3.5 rounded-xl bg-rose-500/10 text-rose-400 font-bold text-xs flex items-center space-x-2 border border-rose-500/20"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* --- MAIN CONTENT CONTAINER --- */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 min-h-screen">
        {children}
      </main>

      {/* Logout Confirm Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        type="logout"
        onConfirm={logout}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
};
