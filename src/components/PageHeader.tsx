import React from 'react';

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, right, className = '' }) => {
  return (
    <div className={`glass-panel rounded-2xl p-3 sm:p-4 mb-5 border border-white/10 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center space-x-3 min-w-0">
        {icon && (
          <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-black text-white truncate">{title}</h1>
        </div>
      </div>
      {right && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {right}
        </div>
      )}
    </div>
  );
};
