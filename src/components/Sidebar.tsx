import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Upload, MessageSquare, Settings, LogOut, ShieldCheck, Building2, User, Menu, X, SlidersHorizontal, Sun, Moon, TrendingUp, Sparkles, Bot, RefreshCw, UploadCloud, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { UniversalModal } from './UniversalModal';
import { ScrollToTopButton } from './ScrollToTopButton';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { Organization, OrgMember, UserProfileExtended, SidebarMode } from '../types';
import { isAdminOrOwner, hasFullRosterAccess, hasFullRenewalsAccess } from '../lib/permissions';
import { ROLE_LABELS_SHORT } from '../lib/roles';

export type NavigationTab = 'dashboard' | 'trends' | 'nudges' | 'chat' | 'org' | 'profile' | 'settings' | 'import' | 'renewals';

interface SidebarProps {
  activeTab: NavigationTab;
  activeSubPath?: string | null;
  setActiveTab: (tab: NavigationTab, subPath?: string) => void;
  memberCount: number;
  reportCount?: number;
  org: Organization | null;
  orgMember: OrgMember | null;
  userProfile: UserProfileExtended | null;
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarProps> = ({
  activeTab,
  activeSubPath = null,
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

  const isAdminOrOwnerRole = isAdminOrOwner(orgMember?.role);
  const canSeeFullRoster = hasFullRosterAccess(orgMember?.role, orgMember?.committees);
  const canManageRenewals = hasFullRenewalsAccess(orgMember?.role, orgMember?.committees);
  const isNavItemAllowed = (item: { adminOnly?: boolean; needsRoster?: boolean; needsRenewals?: boolean }) =>
    !(item.adminOnly && !isAdminOrOwnerRole) &&
    !(item.needsRoster && !canSeeFullRoster) &&
    !(item.needsRenewals && !canManageRenewals);

  const updateSidebarMode = (mode: SidebarMode) => {
    setSidebarMode(mode);
    localStorage.setItem('bni_sidebar_mode', mode);
    setShowModeModal(false);
  };

  const navItems: Array<{
    id: NavigationTab;
    label: string;
    icon: typeof BarChart3;
    badge?: number | null;
    subPath?: string;
    group: 'Overview' | 'Engage' | 'Manage';
    adminOnly?: boolean;
    needsRoster?: boolean;
    needsRenewals?: boolean;
  }> = [
    { id: 'dashboard' as NavigationTab, group: 'Overview', label: 'Dashboard', icon: BarChart3, badge: reportCount > 0 ? reportCount : null },
    { id: 'trends' as NavigationTab, group: 'Overview', label: 'Trends', icon: TrendingUp },
    { id: 'nudges' as NavigationTab, group: 'Engage', label: 'Messages', icon: MessageSquare, needsRoster: true },
    // Renewals hidden for now (not yet role-enforced server-side). Uncomment both, and add
    // 'renewals' back to validTabs in App.tsx, to re-enable.
    // { id: 'renewals' as NavigationTab, label: 'Renewals', icon: RefreshCw },
    // { id: 'renewals' as NavigationTab, label: 'Import Data', icon: UploadCloud, subPath: 'import', needsRenewals: true },
    { id: 'org' as NavigationTab, group: 'Manage', label: 'Chapter', icon: Building2 },
    { id: 'settings' as NavigationTab, group: 'Manage', label: 'Settings', icon: Settings, adminOnly: true },
    { id: 'chat' as NavigationTab, group: 'Engage', label: 'Chapter AI', icon: Bot, needsRoster: true },
  ];

  // External apps on this same Firebase project, reached via cross-app SSO (see src/lib/sso.ts)
  // -- clicking signs the member straight in there, no separate login. Shown to everyone, not
  // gated by the rrc/slips committee here: that gate is enforced on the app itself (checked
  // from the ID token's custom claims), which is also where a member without access is told to
  // ask an admin, rather than the button just silently not appearing.
  // Each sibling app is tinted with its own brand colour (RRC: forest green, Slips: orange/cream)
  // so they read as distinct products rather than more nav tabs. Class strings are spelled out in
  // full so Tailwind can see them.
  const externalApps: Array<{
    label: string; subtitle: string; href: string; icon: typeof BarChart3;
    tile: string; card: string; sub: string;
  }> = [
    {
      label: 'BNI RRC', subtitle: 'Renewals & retention', href: 'https://bni-rrc-flax.vercel.app', icon: RefreshCw,
      tile: 'bg-gradient-to-br from-[#2f8a65] to-[#1c5640] text-white shadow-[#246b4f]/40',
      card: 'border-[#2f8a65]/30 bg-[#246b4f]/10 hover:bg-[#246b4f]/20 hover:border-[#2f8a65]/60',
      sub: 'text-[#6fcfa4]',
    },
    {
      label: 'BNI Slips', subtitle: 'Slips & tracking', href: 'https://bni-rrc-slips.vercel.app', icon: FileSpreadsheet,
      tile: 'bg-gradient-to-br from-[#f0703f] to-[#d6542c] text-white shadow-[#d6542c]/40',
      card: 'border-[#d6542c]/30 bg-[#d6542c]/10 hover:bg-[#d6542c]/20 hover:border-[#f0703f]/60',
      sub: 'text-[#f6a67f]',
    },
  ];

  // Width calculations based on sidebarMode
  const isCompact = sidebarMode === 'icons' || (sidebarMode === 'hover' && !isHovered);
  const sidebarWidthClass = isCompact ? 'w-20' : 'w-64';
  const mainMarginClass = sidebarMode === 'icons' ? 'lg:ml-20' : sidebarMode === 'hover' ? (isHovered ? 'lg:ml-64' : 'lg:ml-20') : 'lg:ml-64';

  return (
    <div className={`flex flex-col lg:flex-row antialiased ${
      activeTab === 'chat'
        ? 'fixed inset-0 h-dvh max-h-dvh overflow-hidden'
        : 'min-h-screen'
    }`}>
      {/* --- DESKTOP SIDEBAR (≥1024px) --- */}
      <aside
        onMouseEnter={() => { if (sidebarMode === 'hover') setIsHovered(true); }}
        onMouseLeave={() => { if (sidebarMode === 'hover') setIsHovered(false); }}
        className={`hidden lg:flex flex-col ${sidebarWidthClass} fixed top-0 left-0 bottom-0 glass-panel border-r border-white/10 p-4 transition-all duration-300 ease-in-out z-30 overflow-y-auto`}
      >
        {/* Sidebar Header with App Logo */}
        <div className={`pb-4 border-b border-white/10 flex ${isCompact ? 'flex-col items-center space-y-3' : 'items-center justify-between'}`}>
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <img
              src="/icons/icon.svg"
              alt="Handychapter Logo"
              className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-emerald-500/20 shrink-0"
            />
            {!isCompact && (
              <div className="overflow-hidden">
                <h1 className="text-base font-extrabold text-white tracking-wide truncate">Handychapter</h1>
                <p className="text-[11px] text-emerald-400 font-semibold truncate">{org?.name || 'Chapter Portal'}</p>
              </div>
            )}
          </div>

          {/* Menu Icon (Shows beside title when expanded, directly BELOW logo when compact/closed) */}
          <button
            onClick={() => setShowModeModal(true)}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-white/10 transition-all shadow-md shrink-0"
            title="Sidebar View Preferences"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 py-3">
          {navItems.map((item, idx, all) => {
            if (!isNavItemAllowed(item)) return null;
            // A group header appears above the first visible item of each group (a divider when compact).
            const firstOfGroup = all.findIndex(n => n.group === item.group && isNavItemAllowed(n)) === idx;
            const Icon = item.icon;
            // Two nav items can share id 'renewals' (plain vs the Import
            // sub-view) -- only distinguish by subPath for that id, so
            // every other tab keeps its original "active whenever this tab
            // is open, regardless of sub-report" behavior.
            const isActive = activeTab === item.id && (item.id !== 'renewals' || (item.subPath ?? null) === activeSubPath);

            return (
              <div key={`${item.id}-${item.subPath ?? ''}`}>
                {firstOfGroup && (isCompact
                  ? (idx > 0 && <div className="my-2 border-t border-white/10" />)
                  : <p className={`px-3.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${idx > 0 ? 'pt-3' : 'pt-1'}`}>{item.group}</p>)}
                <button
                  onClick={() => setActiveTab(item.id, item.subPath)}
                  title={isCompact ? item.label : undefined}
                  className={`group/nav w-full flex items-center ${isCompact ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                      : item.id === 'chat'
                      ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
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
              </div>
            );
          })}

          {/* External apps (same Firebase project, cross-app SSO) */}
          <div className={`${isCompact ? 'pt-3 flex flex-col items-center space-y-2' : 'pt-3 space-y-2'} border-t border-white/10 mt-3`}>
            {!isCompact && <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Your apps</p>}
            {externalApps.map((app) => {
              const Icon = app.icon;
              return (
                <a
                  key={app.href}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`w-full p-2 rounded-xl border flex items-center space-x-3 transition-all active:scale-[0.99] ${app.card}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md ${app.tile}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-extrabold text-white truncate">{app.label}</span>
                    <span className={`block text-[10px] font-semibold truncate ${app.sub}`}>{app.subtitle}</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </a>
              );
            })}
          </div>
        </nav>

        {/* Profile Footer & Logout (Click Avatar to open Profile) */}
        <div className="pt-3 border-t border-white/10 space-y-2">
          {user && (
            <div
              className={`sidebar-profile-card flex items-center justify-between ${isCompact ? 'justify-center p-1.5' : 'p-2'} rounded-xl bg-slate-900/60 border ${
                activeTab === 'profile' ? 'border-emerald-500/80 bg-emerald-500/10' : 'border-white/5 hover:border-emerald-500/30 hover:bg-slate-800/80'
              } transition-all group`}
            >
              <div
                onClick={() => setActiveTab('profile')}
                title={isCompact ? 'View & Edit Profile' : undefined}
                className="flex items-center space-x-2.5 flex-1 min-w-0 cursor-pointer"
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
                      <span>{orgMember?.role ? ROLE_LABELS_SHORT[orgMember.role] : 'Member'}</span>
                    </div>
                  </div>
                )}
              </div>

              {!isCompact && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTheme(themeMode === 'dark' ? 'light' : 'dark');
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-white/10 transition-all shrink-0 ml-1 cursor-pointer"
                  title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
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
      <header className="lg:hidden shrink-0 sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 py-2.5 backdrop-blur-xl pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <img
              src="/icons/icon.svg"
              alt="Handychapter Logo"
              className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-emerald-500/20 shrink-0"
            />
            <div className="overflow-hidden">
              <h1 className="text-sm font-extrabold text-white tracking-wide truncate">Handychapter</h1>
              <p className="text-[10px] text-emerald-400 font-semibold truncate">{org?.name || 'Chapter Portal'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Theme Toggle Button */}
            <button
              onClick={() => toggleTheme(themeMode === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-white/10 transition-all shadow-md shrink-0 cursor-pointer"
              title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {themeMode === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="relative p-0.5 rounded-full ring-2 ring-emerald-500/50 hover:ring-emerald-400 transition-all shrink-0 cursor-pointer"
            >
              {userProfile?.avatar_url || user?.photoURL ? (
                <img
                  src={userProfile?.avatar_url || user?.photoURL || ''}
                  alt="User Avatar"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400 font-bold text-xs">
                  {userProfile?.full_name ? userProfile.full_name.charAt(0) : 'U'}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Profile & Logout Menu Drawer */}
        {mobileMenuOpen && (
          <div className="pt-3 pb-2 space-y-2 border-t border-white/10 mt-2.5 animate-fadeIn">
            {/* Profile Info Card */}
            {user && (
              <div
                className={`flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border ${
                  activeTab === 'profile' ? 'border-emerald-500/80 bg-emerald-500/10' : 'border-white/10'
                } transition-all`}
              >
                <div
                  onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}
                  className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                >
                  <img
                    src={userProfile?.avatar_url || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                    alt="User Avatar"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/40 shrink-0"
                  />
                  <div className="overflow-hidden flex-1 text-left">
                    <div className="text-xs font-bold text-white truncate">{userProfile?.full_name || user.displayName || 'Member Profile'}</div>
                    <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>{(orgMember?.role ? ROLE_LABELS_SHORT[orgMember.role] : 'Member').toUpperCase()} &bull; View Profile</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* External apps (same Firebase project, cross-app SSO) */}
            {externalApps.map((app) => {
              const Icon = app.icon;
              return (
                <a
                  key={app.href}
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-slate-900/90 text-slate-300 font-bold text-xs flex items-center justify-between border border-white/10 transition-all active:scale-[0.99]"
                >
                  <span className="flex items-center space-x-2">
                    <Icon className="w-4 h-4" />
                    <span>{app.label}</span>
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              );
            })}

            {/* Sign Out Action Button */}
            <button
              onClick={() => { setMobileMenuOpen(false); setShowLogoutConfirm(true); }}
              className="w-full py-2.5 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs flex items-center justify-center space-x-2 border border-rose-500/20 transition-all active:scale-[0.99]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* --- MAIN CONTENT CONTAINER --- */}
      <main className={`flex-1 min-h-0 ${mainMarginClass} w-full transition-all duration-300 ease-in-out ${
        activeTab === 'chat'
          ? 'p-0 pb-0 h-full max-h-full overflow-hidden flex flex-col'
          : 'p-2.5 sm:p-5 lg:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+100px)] lg:pb-8 min-h-screen'
      }`}>
        {children}
      </main>

      {/* --- MOBILE FLOATING GLASS CAPSULE BOTTOM NAVIGATION BAR (<1024px) --- */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pointer-events-none">
        <nav className="pointer-events-auto max-w-sm sm:max-w-md mx-auto bg-slate-900/80 backdrop-blur-3xl border border-white/20 rounded-full p-2 flex items-center justify-around shadow-[0_16px_40px_rgba(0,0,0,0.85)] shadow-emerald-500/20 ring-1 ring-white/10">
          {navItems.map((item) => {
            if (!isNavItemAllowed(item)) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id && (item.id !== 'renewals' || (item.subPath ?? null) === activeSubPath);
            return (
              <div key={`${item.id}-${item.subPath ?? ''}`} className="flex items-center flex-1">
                {/* Thin vertical separator before Chapter AI on mobile */}
                {item.id === 'chat' && (
                  <div className="w-px h-6 bg-white/15 mx-1 shrink-0" />
                )}
                <button
                  onClick={() => setActiveTab(item.id, item.subPath)}
                  title={item.label}
                  className={`flex-1 flex items-center justify-center py-2.5 px-1 rounded-full transition-all duration-300 active:scale-90 ${
                    isActive
                      ? 'text-emerald-400 bg-gradient-to-tr from-emerald-500/25 to-teal-400/25 border border-emerald-500/50 font-black shadow-lg shadow-emerald-500/20 -translate-y-0.5'
                      : item.id === 'chat'
                      ? 'text-emerald-500/70 hover:text-emerald-400 font-medium'
                      : 'text-slate-400 hover:text-slate-200 font-medium'
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'text-emerald-400 scale-110' : item.id === 'chat' ? 'text-emerald-500/70' : 'text-slate-400'}`} />
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Preferences Modal (Persisted in localStorage) */}
      <UniversalModal
        isOpen={showModeModal}
        onClose={() => setShowModeModal(false)}
        title="Preferences"
        icon={<SlidersHorizontal className="w-4 h-4 text-emerald-400" />}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
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
      </UniversalModal>

      {/* Logout Confirm Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        type="logout"
        onConfirm={logout}
        onClose={() => setShowLogoutConfirm(false)}
      />

      {/* Floating Scroll To Top Circular Button (Shows on scroll, auto-hides after 3s) */}
      <ScrollToTopButton />

      {/* PWA Install Prompt for iOS & Android */}
      <PWAInstallPrompt />
    </div>
  );
};
