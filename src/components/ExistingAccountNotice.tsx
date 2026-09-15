import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AlertTriangle, ArrowRight, UserCheck, Trash2 } from 'lucide-react';

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
 *
 * Signing out and deleting the duplicate are kept as separate actions: nothing is removed
 * unless the user explicitly asks and confirms.
 */
export const ExistingAccountNotice: React.FC<ExistingAccountNoticeProps> = ({
  match,
  phoneNumber,
  onContinueAnyway,
}) => {
  const { deleteAccount, logout } = useAuth();
  const { showToast } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /** Simply returns to sign-in. Nothing is deleted — the duplicate is left as it is. */
  const handleSignOut = async () => {
    setIsSwitching(true);
    try {
      await logout();
      showToast('Signed out. Please sign in with Google instead.', 'info');
    } catch (err) {
      console.error('Sign out failed:', err);
      showToast('Could not sign out. Please try again.', 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  /** Removes the duplicate account, but only ever from the explicit confirmed action. */
  const handleDeleteDuplicate = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount();
      if (result.ok) {
        showToast('Duplicate account deleted. Sign in with Google to continue.', 'success');
        setShowDeleteConfirm(false);
      } else {
        showToast(result.error || 'Could not delete this account.', 'error');
      }
    } catch (err: any) {
      console.error('Delete duplicate failed:', err);
      showToast(err?.message || 'Could not delete this account.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#001D39] text-slate-100 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 p-[2px] shadow-xl shadow-amber-500/20 mb-1">
            <div className="w-full h-full bg-[#001D39] rounded-[14px] flex items-center justify-center">
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
            onClick={handleSignOut}
            disabled={isSwitching || isDeleting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSwitching ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <span>Sign out &amp; use Google</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Deleting is a separate, explicitly labelled action — never a side effect of
              signing out, which would destroy an account behind the user's back. */}
          <div className="pt-3 border-t border-white/10 space-y-2.5">
            <p className="text-[11px] text-slate-400 font-medium">
              This phone sign-in created an empty second account. Signing out leaves it in
              place, which is harmless. You can remove it if you would rather not keep it:
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSwitching || isDeleting}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-xs border border-rose-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete this duplicate account</span>
            </button>
          </div>

          <div className="pt-3 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={onContinueAnyway}
              disabled={isSwitching || isDeleting}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              This is not me — continue with a separate account
            </button>
          </div>
        </GlassCard>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        type="delete"
        title="Delete Duplicate Account?"
        message={
          `This permanently deletes the empty account just created for ${phoneNumber || 'this number'}. ` +
          `The existing account belonging to ${match.full_name} is NOT affected — its chapter, ` +
          `reports and members stay exactly as they are. You will be returned to the sign-in screen.`
        }
        confirmText="Delete Duplicate"
        onConfirm={handleDeleteDuplicate}
        onClose={() => setShowDeleteConfirm(false)}
        isLoading={isDeleting}
      />
    </div>
  );
};
