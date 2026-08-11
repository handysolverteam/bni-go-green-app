import React, { createContext, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Trash2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Colorful Liquid Glass Toast Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none px-4">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-slideInRight ${
                isSuccess
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-emerald-500/10'
                  : isError
                  ? 'bg-rose-950/80 border-rose-500/40 text-rose-200 shadow-rose-500/10'
                  : isWarning
                  ? 'bg-amber-950/80 border-amber-500/40 text-amber-200 shadow-amber-500/10'
                  : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-200 shadow-cyan-500/10'
              }`}
            >
              <div className="flex items-center space-x-3 pr-2">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                {isError && <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-cyan-400 flex-shrink-0" />}

                <span className="text-xs font-bold leading-tight">{toast.message}</span>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
