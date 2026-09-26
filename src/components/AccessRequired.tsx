import React from 'react';
import { ShieldAlert } from 'lucide-react';

/** Shown when a role navigates straight to a page it isn't allowed to use. */
export const AccessRequired: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
    <ShieldAlert className="w-10 h-10 text-amber-400" />
    <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{message}</p>
  </div>
);
