import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Upload, MessageSquare, Settings, LogOut, ShieldCheck, Building2, User, Menu, X, SlidersHorizontal, FileText, Sun, Moon } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { Organization, OrgMember, UserProfileExtended, SidebarMode } from '../types';

export type NavigationTab = 'dashboard' | 'import' | 'nudges' | 'templates' | 'org' | 'profile' | 'settings';

interface SidebarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  memberCount: number;
  reportCount?: number;
  org: Organization | null;
  orgMember: OrgMember | null;
  userProfile: UserProfileExtended | null;
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  memberCount,
  reportCount = 0,
  org,
  orgMember,
  userProfile,
  children,
}) => {
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Persist sidebarMode & themeMode in localStorage
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    return (localStorage.getItem('bni_sidebar_mode') as SidebarMode) || 'full';
  });

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('bni_theme_mode') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = (mode: 'dark' | 'light') => {
    setThemeMode(mode);
    localStorage.setItem('bni_theme_mode', mode);
    if (mode === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  };

  useEffect(() => {
    if (themeMode === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [themeMode]);

  const [showModeModal, setShowModeModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isAdminOrOwner = orgMember?.role === 'owner' || orgMember?.role === 'admin';

  const updateSidebarMode = (mode: SidebarMode) => {
    setSidebarMode(mode);
    localStorage.setItem('bni_sidebar_mode', mode);
    setShowModeModal(false);
  };

  const navItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: BarChart3, badge: reportCount > 0 ? reportCount : null },
    { id: 'nudges' as NavigationTab, label: 'Outreach Messages', icon: MessageSquare },
    { id: 'templates' as NavigationTab, label: 'Outreach Templates', icon: FileText },
    { id: 'org' as NavigationTab, label: 'Organization', icon: Building2 },
    { id: 'settings' as NavigationTab, label: 'Settings', icon: Settings, adminOnly: true },
  ];

  // Width calculations based on sidebarMode
  const isCompact = sidebarMode === 'icons' || (sidebarMode === 'hover' && !isHovered);
  const sidebarWidthClass = isCompact ? 'w-20' : 'w-64';
  const mainMarginClass = sidebarMode === 'icons' ? 'lg:ml-20' : sidebarMode === 'hover' ? (isHovered ? 'lg:ml-64' : 'lg:ml-20') : 'lg:ml-64';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#060a12] text-slate-100 antialiased">
      {/* --- DESKTOP SIDEBAR --- */}
      <aside
        onMouseEnter={() => { if (sidebarMode === 'hover') setIsHovered(true); }}
        onMouseLeave={() => { if (sidebarMode === 'hover') setIsHovered(false); }}
        className={`hidden lg:flex flex-col ${sidebarWidthClass} glass-panel border-r border-white/10 p-4 fixed top-0 bottom-0 z-40 overflow-y-auto transition-all duration-300 ease-in-out`}
      >
        {/* Brand Header */}
        <div className={`flex ${isCompact ? 'flex-col items-center space-y-3' : 'items-center justify-between'} pb-4 border-b border-white/10`}>
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 flex-shrink-0">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
                <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  BNI
                </span>
              </div>
            </div>
            {!isCompact && (
              <div className="overflow-hidden">
                <h1 className="text-base font-extrabold text-white tracking-wide truncate">Go Green</h1>
                <p className="text-[11px] text-emerald-400 font-semibold truncate">{org?.name || 'Chapter Portal'}</p>
              </div>
            )}
          </div>

          {/* Menu Icon (Shows beside title when expanded, directly BELOW logo when compact/closed) */}
          <button
            onClick={() => setShowModeModal(true)}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-white/10 transition-all shadow-md"
            title="Sidebar View Preferences"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 py-3">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdminOrOwner) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCompact ? item.label : undefined}
                className={`w-full flex items-center ${isCompact ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!isCompact && <span className="truncate">{item.label}</span>}
                </div>
                {!isCompact && item.badge !== null && item.badge !== undefined && (
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${isActive ? 'bg-slate-950 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile Footer & Logout (Click Avatar to open Profile) */}
        <div className="pt-3 border-t border-white/10 space-y-2">
          {user && (
            <div
              onClick={() => setActiveTab('profile')}
              title={isCompact ? 'View & Edit Profile' : undefined}
              className={`flex items-center ${isCompact ? 'justify-center p-1.5' : 'space-x-2.5 p-2'} rounded-xl bg-slate-900/60 border ${
                activeTab === 'profile' ? 'border-emerald-500/80 bg-emerald-500/10' : 'border-white/5 hover:border-emerald-500/30 hover:bg-slate-800/80'
              } cursor-pointer transition-all group`}
            >
              <img
                src={userProfile?.avatar_url || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                alt="User Avatar"
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover ring-2 ring-emerald-500/40 group-hover:scale-105 transition-transform shrink-0"
              />
              {!isCompact && (
                <div className="overflow-hidden flex-1 text-left">
                  <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                    {userProfile?.full_name || user.displayName}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{orgMember?.role || 'Member'} &bull; Edit Profile</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowLogoutConfirm(true)}
            title={isCompact ? 'Sign Out' : undefined}
            className={`w-full py-2 ${isCompact ? 'px-2' : 'px-3'} rounded-xl bg-slate-900/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 text-xs font-bold flex items-center justify-center space-x-2 transition-all`}
          >
            <LogOut className="w-4 h-4" />
            {!isCompact && <span>Sign Out</span>}
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

            {/* Mobile Profile Card */}
            {user && (
              <div
                onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}
                className={`flex items-center space-x-3 p-3 rounded-xl bg-slate-900/80 border ${
                  activeTab === 'profile' ? 'border-emerald-500/80 bg-emerald-500/10' : 'border-white/10'
                } cursor-pointer transition-all`}
              >
                <img
                  src={userProfile?.avatar_url || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                  alt="User Avatar"
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/40 shrink-0"
                />
                <div className="overflow-hidden flex-1 text-left">
                  <div className="text-xs font-bold text-white truncate">{userProfile?.full_name || user.displayName}</div>
                  <div className="text-[10px] text-slate-400 capitalize font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{orgMember?.role || 'Member'} &bull; View Profile</span>
                  </div>
                </div>
              </div>
            )}

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
      <main className={`flex-1 ${mainMarginClass} p-4 lg:p-8 min-h-screen transition-all duration-300 ease-in-out`}>
        {children}
      </main>

      {/* Preferences Modal (Persisted in localStorage) */}
      {showModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="glass-panel w-full max-w-sm p-6 rounded-2xl space-y-5 border-emerald-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <span>Preferences</span>
              </h3>
              <button onClick={() => setShowModeModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Light / Dark Mode Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Theme Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleTheme('dark')}
                  className={`p-3 rounded-xl border text-center text-xs font-extrabold flex items-center justify-center space-x-2 transition-all ${
                    themeMode === 'dark'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md'
                      : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  <span>Dark Mode</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTheme('light')}
                  className={`p-3 rounded-xl border text-center text-xs font-extrabold flex items-center justify-center space-x-2 transition-all ${
                    themeMode === 'light'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md'
                      : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  <span>Light Mode</span>
                </button>
              </div>
            </div>

            {/* Sidebar View Mode Options */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300">Sidebar View Mode</label>
              <button
                onClick={() => updateSidebarMode('full')}
                className={`w-full p-3 rounded-xl border text-left text-xs font-bold transition-all ${
                  sidebarMode === 'full' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-900/60 border-white/5 text-slate-300'
                }`}
              >
                <div>Expanded View</div>
                <div className="text-[10px] text-slate-400 font-normal">Shows navigation icons and section titles</div>
              </button>

              <button
                onClick={() => updateSidebarMode('icons')}
                className={`w-full p-3 rounded-xl border text-left text-xs font-bold transition-all ${
                  sidebarMode === 'icons' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-900/60 border-white/5 text-slate-300'
                }`}
              >
                <div>Compact Icon View</div>
                <div className="text-[10px] text-slate-400 font-normal">Minimal sidebar displaying icons only</div>
              </button>

              <button
                onClick={() => updateSidebarMode('hover')}
                className={`w-full p-3 rounded-xl border text-left text-xs font-bold transition-all ${
                  sidebarMode === 'hover' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-900/60 border-white/5 text-slate-300'
                }`}
              >
                <div>Expand on Hover</div>
                <div className="text-[10px] text-slate-400 font-normal">Collapsed by default, expands when mouse hovers over sidebar</div>
              </button>
            </div>
          </div>
        </div>
      )}

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
