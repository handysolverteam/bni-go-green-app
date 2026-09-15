import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { Building2, KeyRound, Plus, ArrowRight, LogOut } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Organization, OrgMember } from '../types';

interface OrgOnboardingScreenProps {
  /** May be async: the spinner is held until the chapter's data has actually loaded. */
  onOrgJoined: (data: { org: Organization; member: OrgMember }) => void | Promise<void>;
  /**
   * An invite code AppContent already attempted to auto-join with, present here only because
   * that attempt failed (invalid/expired code) — on success this screen never mounts at all,
   * since `org` becomes non-null. Pre-fills the Join tab so the user can see what was tried
   * and retry or correct it, rather than landing on a blank form with no explanation.
   */
  prefillCode?: string | null;
}

export const OrgOnboardingScreen: React.FC<OrgOnboardingScreenProps> = ({ onOrgJoined, prefillCode }) => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'create' | 'join'>(prefillCode ? 'join' : 'create');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Form states
  const [orgName, setOrgName] = useState('');
  const [chapterName, setChapterName] = useState('');
  const [city, setCity] = useState('');
  const [code, setCode] = useState(prefillCode || '');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    if (!orgName.trim()) {
      showToast('Please enter Chapter Organization Name', 'error');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await supabaseService.createOrganization(
        orgName.trim(),
        chapterName.trim(),
        city.trim(),
        user.uid,
        user.email || undefined
      );

      if (res) {
        showToast(`Organization "${res.org.name}" created! Code: ${res.org.code}`, 'success');
        // Awaited so the button keeps spinning until the chapter's data is loaded, rather
        // than dropping the user onto an empty dashboard that fills in a moment later.
        await onOrgJoined(res);
      } else {
        const msg = 'Failed to create organization in database.';
        setErrorMsg(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.message || 'Create organization failed.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    // Codes are always 6 digits; strip anything a paste may have carried in.
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      showToast('Please enter a valid 6-digit chapter code', 'error');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res: any = await supabaseService.joinOrganization(
        cleanCode,
        user.uid,
        user.email || undefined
      );

      if (res && 'org' in res) {
        showToast(`Joined organization "${res.org.name}"!`, 'success');
        await onOrgJoined({ org: res.org, member: res.member });
      } else {
        const msg = res?.error || 'Invalid 6-digit organization code.';
        setErrorMsg(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to join organization.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#001D39] text-slate-100 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-xl shadow-emerald-500/20 mb-1">
            <div className="w-full h-full bg-[#001D39] rounded-[14px] flex items-center justify-center">
              <Building2 className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white">Setup Your Chapter Organization</h1>
          <p className="text-xs text-slate-400">Create a new chapter organization or join with a 6-digit code.</p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-white/10">
          <button
            onClick={() => { setMode('create'); setErrorMsg(null); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'create'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Create Org</span>
          </button>

          <button
            onClick={() => { setMode('join'); setErrorMsg(null); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'join'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Join with Code</span>
          </button>
        </div>

        {/* Glass Card Form */}
        <GlassCard glow className="p-6 space-y-4 border-white/10 shadow-2xl">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Organization / Chapter Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BNI Champions Chapter"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div>

              {/* <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Sub-Chapter Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Titans"
                  value={chapterName}
                  onChange={(e) => setChapterName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div> */}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">City / Region</label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai, India"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !orgName.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <span>{isLoading ? 'Creating...' : 'Create Chapter Organization'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">6-Digit Organization Code *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. 789210"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className="w-full px-3.5 py-3 rounded-xl glass-input text-center text-lg font-black tracking-widest text-emerald-400"
                />
                <p className="text-[11px] text-slate-400 text-center">Ask your Chapter Owner or Admin for the 6-digit code</p>
              </div>

              <button
                type="submit"
                disabled={isLoading || code.trim().length < 6}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <span>{isLoading ? 'Verifying Code...' : 'Join Organization'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Subtle non-highlighted sign out option */}
          <div className="pt-4 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="inline-flex items-center space-x-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Sign out or switch account ({user?.email})</span>
            </button>
          </div>
        </GlassCard>
      </div>

      {showLogoutConfirm && (
        <ConfirmationModal
          isOpen={showLogoutConfirm}
          type="logout"
          title="Sign Out of Account?"
          message={`Are you sure you want to sign out of ${user?.email || 'your account'}? You can log in with a different account.`}
          confirmText="Sign Out"
          onConfirm={() => {
            setShowLogoutConfirm(false);
            logout();
          }}
          onClose={() => setShowLogoutConfirm(false)}
        />
      )}
    </div>
  );
};
