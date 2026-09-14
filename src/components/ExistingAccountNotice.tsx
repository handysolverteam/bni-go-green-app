import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';

export interface ExistingAccountMatch {
  full_name: string;
  email?: string | null;
}

interface ExistingAccountNoticeProps {
  match: ExistingAccountMatch;
  /** Number the user just signed in with, for display. */
  phoneNumber?: string | null;
  /** Dismiss the notice and continue setting up a genuinely separate account. */
  onContinueAnyway: () => void;
}

/** Masks an address for display: monis@gmail.com -> m•••s@gmail.com */
const maskEmail = (email?: string | null): string => {
  if (!email || !email.includes('@')) return 'your Google account';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}•••@${domain}`;
  return `${name[0]}•••${name[name.length - 1]}@${domain}`;
};

/**
 * Shown when someone signs in by phone and that number already belongs to a different
 * account. Firebase has already created the second account by this point, so the goal is
 * to steer them back before they build a parallel chapter under it.
 */
export const ExistingAccountNotice: React.FC<ExistingAccountNoticeProps> = ({
  match,
  phoneNumber,
  onContinueAnyway,
}) => {
  const { deleteAccount, logout } = useAuth();
  const { showToast } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);

  /**
   * Removes the duplicate account that was just created, then returns to sign-in.
   * Deleting it avoids leaving an empty orphan behind; if that fails we still sign out,
   * because getting them back to the login screen is the point.
   */
  const handleUseExisting = async () => {
    setIsSwitching(true);
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        console.warn('Could not remove duplicate account:', result.error);
        await logout();
      }
      showToast('Signed out. Please sign in with Google instead.', 'info');
    } catch (err) {
      console.error('Switch to existing account failed:', err);
      await logout();
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#060a12] text-slate-100 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 p-[2px] shadow-xl shadow-amber-500/20 mb-1">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
              <UserCheck className="w-7 h-7 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white">You already have an account</h1>
        </div>

        <GlassCard glow className="p-6 space-y-5 border-amber-500/30 shadow-2xl">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              {phoneNumber ? <><span className="font-black text-white">{phoneNumber}</span> is</> : 'This number is'}
              {' '}already registered to{' '}
              <span className="font-black text-white">{match.full_name}</span>, who signs in with{' '}
              <span className="font-black text-white">{maskEmail(match.email)}</span>.
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Continuing here would create a <span className="font-bold text-white">second, empty account</span> —
            your chapter, reports and members would not appear in it.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 space-y-2">
            <p className="text-[11px] font-black text-emerald-300 uppercase tracking-wide">Recommended</p>
            <ol className="text-[11px] text-slate-300 font-medium space-y-1.5 list-decimal list-inside">
              <li>Sign in with Google instead</li>
              <li>Open <span className="font-bold text-white">Profile → Sign-in Methods</span></li>
              <li>Add this phone number there</li>
            </ol>
            <p className="text-[11px] text-slate-400 pt-1">
              After that, either method signs you into the same account.
            </p>
          </div>

          <button
            type="button"
            onClick={handleUseExisting}
            disabled={isSwitching}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSwitching ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Switching...</span>
              </>
            ) : (
              <>
                <span>Sign in with Google instead</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="pt-3 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={onContinueAnyway}
              disabled={isSwitching}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              This is not me — continue with a separate account
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
