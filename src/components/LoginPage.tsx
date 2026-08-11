import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './GlassCard';
import { ShieldCheck, Sparkles, CheckCircle2, Award, Zap } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, loading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#080d19]">
      {/* Dynamic light glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-teal-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md space-y-8 z-10">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 p-[2px] shadow-xl shadow-emerald-500/30 mb-2">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
              <Zap className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            BNI <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Go Green</span>
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Automated PALMS 100-Point Scoring Engine & Smart WhatsApp Outreach for BNI Chapter Leaders
          </p>
        </div>

        {/* Login Card */}
        <GlassCard glow className="p-8 space-y-6 text-center border-emerald-500/20">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Welcome Back, Director</h2>
            <p className="text-xs text-slate-400">Sign in to manage your chapter's PALMS scores & send WhatsApp nudges</p>
          </div>

          <div className="space-y-4 pt-2">
            <button
              onClick={handleGoogleLogin}
              disabled={loading || isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm flex items-center justify-center space-x-3 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isSubmitting ? 'Authenticating...' : 'Sign in with Google'}</span>
            </button>
          </div>

          <div className="pt-4 border-t border-white/10 space-y-3 text-left">
            <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Key Capabilities:</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Import PALMS Excel / CSV files with 1-click</span>
              </li>
              <li className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <span>Compute 100-Point Traffic Light Scores (Green $\ge 70$)</span>
              </li>
              <li className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Instant personalized WhatsApp nudge recommendations</span>
              </li>
            </ul>
          </div>
        </GlassCard>

        <p className="text-center text-xs text-slate-500">
          HandySolver Team &bull; Powered by Firebase Auth & Supabase Cloud
        </p>
      </div>
    </div>
  );
};
