import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GlassCard } from './GlassCard';
import { ShieldCheck, Lock, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, loading } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#060a12] text-slate-100">
      {/* Subtle ambient light glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Minimal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 p-[2px] shadow-xl shadow-emerald-500/20 mb-1">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
              <Zap className="w-7 h-7 text-emerald-400" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            BNI <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Go Green</span>
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            100-Point Score Engine & WhatsApp Direct Outreach
          </p>
        </div>

        {/* Minimal Glass Card */}
        <GlassCard glow className="p-6 sm:p-8 space-y-6 text-center border-white/10 shadow-2xl">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Director Portal</h2>
            <p className="text-xs text-slate-400">Secure single sign-on via Google OAuth 2.0</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold text-left">
              {errorMsg}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={handleGoogleLogin}
              disabled={loading || isAuthenticating}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm flex items-center justify-center space-x-3 transition-all shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
              <span>{isAuthenticating ? 'Authenticating...' : 'Continue with Google'}</span>
              <ArrowRight className="w-4 h-4 ml-1 text-slate-600" />
            </button>
          </div>

          {/* Security Banner */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-center space-x-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-bit SSL Encrypted &bull; Direct Google OAuth</span>
          </div>
        </GlassCard>

        {/* Footer */}
        <div className="text-center space-y-1">
          <p className="text-xs text-slate-500">HandySolver Team &bull; BNI Chapter Operations</p>
        </div>
      </div>
    </div>
  );
};
