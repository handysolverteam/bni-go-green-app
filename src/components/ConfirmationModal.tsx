import React from 'react';
import { AlertTriangle, Trash2, LogOut, RotateCcw, Check, UserPlus } from 'lucide-react';
import { UniversalModal } from './UniversalModal';

export type ConfirmationType = 'logout' | 'delete' | 'purge' | 'reset' | 'clearLogs' | 'rejoinAfterDelete';

interface ConfirmationModalProps {
  isOpen: boolean;
  type: ConfirmationType;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  type,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const getConfig = () => {
    switch (type) {
      case 'logout':
        return {
          icon: <LogOut className="w-6 h-6 text-amber-400" />,
          title: title || 'Sign Out Confirmation',
          message: message || 'Are you sure you want to sign out of Handychapter?',
          confirmText: confirmText || 'Sign Out',
          confirmBtnClass: 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 font-extrabold',
        };
      case 'delete':
        return {
          icon: <Trash2 className="w-6 h-6 text-rose-400" />,
          title: title || 'Delete Member Confirmation',
          message: message || 'Are you sure you want to remove this member from the roster?',
          confirmText: confirmText || 'Delete Member',
          confirmBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white font-extrabold shadow-lg shadow-rose-600/30',
        };
      case 'purge':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />,
          title: title || 'Delete All Member Data',
          message: message || 'DANGER: This will permanently delete ALL imported chapter members and score history from your Supabase database.',
          confirmText: confirmText || 'Delete',
          confirmBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white font-extrabold shadow-lg shadow-rose-600/30',
        };
      case 'reset':
        return {
          icon: <RotateCcw className="w-6 h-6 text-teal-400" />,
          title: title || 'Reset Scoring Thresholds',
          message: message || 'Reset all category thresholds back to defaults?',
          confirmText: confirmText || 'Reset Defaults',
          confirmBtnClass: 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 font-extrabold',
        };
      case 'rejoinAfterDelete':
        return {
          icon: <UserPlus className="w-6 h-6 text-emerald-400" />,
          title: title || 'Rejoin Chapter?',
          message:
            message ||
            'This Google account previously deleted its Handychapter account. This invite link would rejoin that chapter under a fresh account — continue?',
          confirmText: confirmText || 'Rejoin',
          confirmBtnClass: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 font-extrabold',
        };
      case 'clearLogs':
      default:
        return {
          icon: <AlertTriangle className="w-6 h-6 text-slate-400" />,
          title: title || 'Clear Logs',
          message: message || 'Clear all delivery logs?',
          confirmText: confirmText || 'Clear Logs',
          confirmBtnClass: 'bg-slate-800 hover:bg-slate-700 text-white font-extrabold',
        };
    }
  };

  const cfg = getConfig();

  return (
    <UniversalModal
      isOpen={isOpen}
      onClose={onClose}
      title={cfg.title}
      icon={cfg.icon}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-300 leading-relaxed">{cfg.message}</p>

        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/10 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 rounded-xl text-xs transition-all active:scale-95 flex items-center space-x-2 ${cfg.confirmBtnClass} disabled:opacity-50`}
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{cfg.confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </UniversalModal>
  );
};
