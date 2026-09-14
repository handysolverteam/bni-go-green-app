import React, { useState } from 'react';
import { Organization, OrgMember } from '../types';
import { GlassCard } from './GlassCard';
import { UniversalModal } from './UniversalModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseService } from '../services/supabaseService';
import { AlertTriangle, LogOut, Trash2, ShieldAlert, Building2, ArrowRight } from 'lucide-react';

interface AccountDangerZoneProps {
  org: Organization | null;
  orgMember: OrgMember | null;
  userEmail?: string | null;
  onLeaveOrganization: () => Promise<{ ok: boolean; error?: string }>;
  onGoToChapterTab?: () => void;
}

const DELETE_PHRASE = 'DELETE';

export const AccountDangerZone: React.FC<AccountDangerZoneProps> = ({
  org,
  orgMember,
  userEmail,
  onLeaveOrganization,
  onGoToChapterTab,
}) => {
  const { user, deleteAccount } = useAuth();
  const { showToast } = useToast();

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveWarning, setLeaveWarning] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isCheckingLeave, setIsCheckingLeave] = useState(false);

  // org_members rows are matched by id or email, so fall back to the signed-in identity
  const effectiveEmail = userEmail || user?.email || null;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');

  /** Checks eligibility up front so a sole owner is warned before they commit to leaving. */
  const handleOpenLeaveModal = async () => {
    setLeaveError(null);
    setLeaveWarning(null);
    setIsBlocked(false);
    setShowLeaveModal(true);

    if (!org?.id || !user?.uid) return;
    setIsCheckingLeave(true);
    try {
      const eligibility = await supabaseService.checkLeaveEligibility(org.id, user.uid, effectiveEmail);
      if (!eligibility.canLeave) {
        setIsBlocked(true);
        setLeaveWarning(eligibility.reason || 'You cannot leave this chapter right now.');
      } else if (eligibility.memberCount <= 1) {
        setLeaveWarning('You are the last person in this chapter. It will be left with no members.');
      }
    } finally {
      setIsCheckingLeave(false);
    }
  };

  const handleConfirmLeave = async () => {
    setIsLeaving(true);
    setLeaveError(null);
    try {
      const result = await onLeaveOrganization();
      if (result.ok) {
        setShowLeaveModal(false);
      } else {
        setLeaveError(result.error || 'Failed to leave the chapter.');
      }
    } catch (err: any) {
      setLeaveError(err?.message || 'Failed to leave the chapter.');
    } finally {
      setIsLeaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (confirmPhrase.trim().toUpperCase() !== DELETE_PHRASE) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteAccount();
      if (result.ok) {
        setShowDeleteModal(false);
        if (result.loginRetained) {
          showToast('Account data deleted. Your Google sign-in could not be removed automatically — contact support to fully revoke it.', 'warning');
        } else {
          showToast('Your account has been permanently deleted.', 'info');
        }
      } else {
        setDeleteError(result.error || 'Failed to delete your account.');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete your account.');
    } finally {
      setIsDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setConfirmPhrase('');
    setDeleteError(null);
  };

  const canConfirmDelete = confirmPhrase.trim().toUpperCase() === DELETE_PHRASE;

  return (
    <>
      <GlassCard className="p-6 space-y-4 border-rose-500/30">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Danger Zone</span>
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">
            These actions affect your own account and membership. They cannot be undone.
          </p>
        </div>

        {/* Leave Organization */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-white/10">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Leave {org?.name || 'Chapter'}</span>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Removes your membership so you can join a different chapter. The chapter's reports and roster are kept.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenLeaveModal}
            disabled={!org?.id}
            className="shrink-0 px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Chapter</span>
          </button>
        </div>

        {/* Delete Account */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Delete My Account</span>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Permanently deletes your profile, chapter memberships and outreach history, then signs you out.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Account</span>
          </button>
        </div>
      </GlassCard>

      {/* Leave Chapter Confirmation */}
      <UniversalModal
        isOpen={showLeaveModal}
        onClose={() => !isLeaving && setShowLeaveModal(false)}
        title="Leave Chapter?"
        icon={<LogOut className="w-6 h-6 text-amber-400" />}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            You are about to leave <span className="font-black text-white">{org?.name || 'this chapter'}</span>
            {orgMember?.role ? <> as <span className="font-bold capitalize text-emerald-400">{orgMember.role}</span></> : null}.
            You will be taken back to the setup screen where you can create or join another chapter with a 6-digit code.
          </p>

          {isCheckingLeave && (
            <p className="text-[11px] text-slate-400 font-semibold">Checking chapter ownership...</p>
          )}

          {leaveWarning && (
            <div className={`p-3 rounded-xl text-xs font-semibold border ${
              isBlocked
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{leaveWarning}</span>
              </div>

              {isBlocked && onGoToChapterTab && (
                <button
                  type="button"
                  onClick={() => { setShowLeaveModal(false); onGoToChapterTab(); }}
                  className="mt-3 w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] border border-white/10 transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Go to Chapter tab to promote an Owner</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {leaveError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {leaveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              onClick={() => setShowLeaveModal(false)}
              disabled={isLeaving}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmLeave}
              disabled={isLeaving || isCheckingLeave || isBlocked}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-extrabold text-xs transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              {isLeaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Leaving...</span>
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>Leave Chapter</span>
                </>
              )}
            </button>
          </div>
        </div>
      </UniversalModal>

      {/* Delete Account Confirmation */}
      <UniversalModal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && closeDeleteModal()}
        title="Delete Account Permanently?"
        icon={<AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            This permanently deletes your Handychapter account
            {user?.email ? <> (<span className="font-bold text-white">{user.email}</span>)</> : null}. This cannot be undone.
          </p>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-2">
            <p className="text-[11px] font-black text-rose-300 uppercase tracking-wide">Will be deleted</p>
            <ul className="text-[11px] text-slate-300 font-medium space-y-1">
              <li>• Your profile, name, photo and bio</li>
              <li>• Your membership in every chapter</li>
              <li>• Your WhatsApp outreach history</li>
              <li>• Your Google sign-in for this app</li>
            </ul>

            <p className="text-[11px] font-black text-emerald-300 uppercase tracking-wide pt-1">Will be kept</p>
            <ul className="text-[11px] text-slate-400 font-medium space-y-1">
              <li>• Chapter roster members and imported reports</li>
              <li>• Chapter templates, settings and AI chat history</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300">
              Type <span className="font-black text-rose-400">{DELETE_PHRASE}</span> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={DELETE_PHRASE}
              className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-black tracking-widest text-center text-rose-300"
            />
          </div>

          {deleteError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {deleteError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              onClick={closeDeleteModal}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting || !canConfirmDelete}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Forever</span>
                </>
              )}
            </button>
          </div>
        </div>
      </UniversalModal>
    </>
  );
};
