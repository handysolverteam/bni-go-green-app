import React from 'react';
import { clsx } from 'clsx';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  glow?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  hoverable = false,
  className = '',
  glow = false,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'glass-panel rounded-2xl p-6 relative overflow-hidden',
        hoverable && 'glass-panel-hover cursor-pointer',
        glow && 'border-emerald-500/30 shadow-[0_0_25px_rgba(34,197,94,0.15)]',
        className
      )}
      {...props}
    >
      {/* Decorative gradient light sweep */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />
      {children}
    </div>
  );
};
