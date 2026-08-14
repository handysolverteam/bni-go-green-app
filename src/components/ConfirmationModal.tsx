import React from 'react';
import { GlassCard } from './GlassCard';
import { AlertTriangle, X, Check, Trash2, LogOut, RotateCcw } from 'lucide-react';

export type ConfirmationType = 'logout' | 'delete' | 'purge' | 'reset' | 'clearLogs';

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
          confirmBtnClass: 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400',
        };
      case 'delete':
        return {
          icon: <Trash2 className="w-6 h-6 text-rose-400" />,
          title: title || 'Delete Member',
          message: message || 'Are you sure you want to remove this member? This action cannot be undone.',
          confirmText: confirmText || 'Delete Member',
          confirmBtnClass: 'bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-400 hover:to-red-500 shadow-rose-500/25',
        };
      case 'purge':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-500 animate-pulse" />,
          title: title || 'Delete All Member Data',
          message: message || 'DANGER: This will permanently delete ALL imported chapter members and score history from your Supabase database.',
          confirmText: confirmText || 'Delete',
          confirmBtnClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30',
        };
      case 'reset':
        return {
          icon: <RotateCcw className="w-6 h-6 text-cyan-400" />,
          title: title || 'Reset Scoring Thresholds',
          message: message || 'Reset all 7 category thresholds back to default BNI 100-Point model?',
          confirmText: confirmText || 'Reset Defaults',
          confirmBtnClass: 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 font-bold',
        };
      case 'clearLogs':
        return {
          icon: <Trash2 className="w-6 h-6 text-slate-400" />,
          title: title || 'Clear Outreach Logs',
          message: message || 'Clear all WhatsApp outbound delivery logs?',
          confirmText: confirmText || 'Clear Logs',
          confirmBtnClass: 'bg-slate-800 hover:bg-slate-700 text-white',
        };
    }
  };

  const cfg = getConfig();

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/25 backdrop-blur-md animate-fadeIn cursor-pointer"
    >
      <GlassCard className="w-full max-w-md p-4 sm:p-5 space-y-4 sm:space-y-5 relative border-t sm:border border-white/15 shadow-2xl rounded-t-3xl sm:rounded-3xl">
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/60 mx-auto -mt-2 sm:hidden shrink-0" />
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start space-x-4">
          <div className="p-3 rounded-2xl bg-slate-900 border border-white/10 flex-shrink-0">
            {cfg.icon}
          </div>

          <div className="space-y-1 pt-1">
            <h3 className="text-lg font-black text-white">{cfg.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{cfg.message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center space-x-1.5 ${cfg.confirmBtnClass} disabled:opacity-50`}
          >
            {isLoading ? (
              <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{isLoading ? 'Processing...' : cfg.confirmText}</span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
