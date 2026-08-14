import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Upload, MessageSquare, Settings, LogOut, ShieldCheck, Menu, X } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

interface NavbarProps {
  activeTab: 'dashboard' | 'import' | 'nudges' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'import' | 'nudges' | 'settings') => void;
  memberCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, memberCount }) => {
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: 'dashboard' | 'import' | 'nudges' | 'settings') => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 lg:px-8 py-3 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => handleTabClick('dashboard')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[10px] flex items-center justify-center">
                <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  BNI
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-extrabold text-white tracking-wide">Handychapter</h1>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v1.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">PALMS Tracker & WhatsApp Nudge</p>
            </div>
          </div>

          {/* Desktop Nav Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
            <button
              onClick={() => handleTabClick('dashboard')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Dashboard</span>
              {memberCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-black rounded-full bg-slate-800 text-slate-300">
                  {memberCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabClick('import')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'import'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import PALMS</span>
            </button>

            <button
              onClick={() => handleTabClick('nudges')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'nudges'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Outreach Nudges</span>
            </button>

            <button
              onClick={() => handleTabClick('settings')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-2">
            {user && (
              <div className="flex items-center space-x-2 bg-slate-900/70 border border-white/10 px-2.5 py-1.5 rounded-xl">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Director'} className="w-7 h-7 rounded-full ring-2 ring-emerald-500/50" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/40">
                    {user.displayName?.charAt(0).toUpperCase() || 'D'}
                  </div>
                )}
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>{user.displayName}</span>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{user.email}</div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowLogoutConfirm(true)}
              title="Sign Out"
              className="p-2 rounded-xl bg-slate-900/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-slate-900/60 text-slate-300 border border-white/10"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden pt-3 pb-2 space-y-2 border-t border-white/10 mt-3 animate-fadeIn">
            <button
              onClick={() => handleTabClick('dashboard')}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === 'dashboard' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>Dashboard</span>
              </div>
              {memberCount > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[10px]">{memberCount}</span>}
            </button>

            <button
              onClick={() => handleTabClick('import')}
              className={`w-full flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === 'import' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 bg-slate-900/60'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Import PALMS</span>
            </button>

            <button
              onClick={() => handleTabClick('nudges')}
              className={`w-full flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === 'nudges' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 bg-slate-900/60'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Outreach Nudges</span>
            </button>

            <button
              onClick={() => handleTabClick('settings')}
              className={`w-full flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === 'settings' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 bg-slate-900/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>
        )}
      </header>

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        type="logout"
        onConfirm={logout}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </>
  );
};
