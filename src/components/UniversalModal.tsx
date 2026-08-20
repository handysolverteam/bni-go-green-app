import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface UniversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-xl', 'max-w-2xl', 'max-w-3xl'
  children: React.ReactNode;
}

export const UniversalModal: React.FC<UniversalModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  maxWidth = 'max-w-md',
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-md animate-fadeIn cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-panel w-full ${maxWidth} max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5 space-y-4 rounded-t-3xl sm:rounded-2xl border-t sm:border border-emerald-500/30 shadow-2xl modal-card-shadow cursor-default`}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 rounded-full bg-slate-700/60 mx-auto -mt-1 mb-1 sm:hidden shrink-0" />

        {/* Modal Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              {icon && (
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  {icon}
                </div>
              )}
              <h3 className="text-base sm:text-lg font-black text-white truncate">{title}</h3>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Modal Content */}
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
