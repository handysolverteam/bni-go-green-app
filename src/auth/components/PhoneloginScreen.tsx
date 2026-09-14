import React, { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../../components/GlassCard';
import {
  Smartphone,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Zap,
  CheckCircle2,
  Heart,
  KeyRound,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface PhoneloginScreenProps {
  onSuccess?: (phoneNumber: string) => void;
  onBackToGoogle?: () => void;
  isLoading?: boolean;
  embedded?: boolean;
}

const COUNTRY_CODES = [
  { code: '+91', country: 'IN', flag: '🇮🇳', label: 'India (+91)' },
  { code: '+1', country: 'US', flag: '🇺🇸', label: 'US/Canada (+1)' },
  { code: '+44', country: 'GB', flag: '🇬🇧', label: 'UK (+44)' },
  { code: '+971', country: 'AE', flag: '🇦🇪', label: 'UAE (+971)' },
  { code: '+65', country: 'SG', flag: '🇸🇬', label: 'Singapore (+65)' },
  { code: '+61', country: 'AU', flag: '🇦🇺', label: 'Australia (+61)' },
];

export const PhoneloginScreen: React.FC<PhoneloginScreenProps> = ({
  onSuccess,
  onBackToGoogle,
  isLoading: externalLoading = false,
  embedded = false,
}) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [selectedCountry, setSelectedCountry] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp'>('sms');

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Handle OTP countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'otp' && resendTimer > 0) {
      setCanResend(false);
      timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, resendTimer]);

  // Auto-focus first OTP input when step changes to 'otp'
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 150);
    }
  }, [step]);

  const cleanPhone = phone.replace(/\D/g, '');
  const fullPhoneNumber = `${selectedCountry} ${cleanPhone}`;

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!cleanPhone || cleanPhone.length < 7) {
      setErrorMsg('Please enter a valid mobile phone number.');
      return;
    }

    setLoading(true);
    try {
      // Simulate API call to send OTP
      await new Promise((resolve) => setTimeout(resolve, 800));
      setStep('otp');
      setResendTimer(30);
      setOtp(['', '', '', '', '', '']);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const enteredOtp = otp.join('');
    if (enteredOtp.length < 6) {
      setErrorMsg('Please enter the full 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      // Simulate verification API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (onSuccess) {
        onSuccess(fullPhoneNumber);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Invalid OTP code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    // Take the last entered character if multiple typed
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setErrorMsg(null);

    // Focus next input if digit entered
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    const nextIndex = Math.min(pastedData.length, 5);
    otpInputsRef.current[nextIndex]?.focus();
  };

  const handleResendOtp = async (channel: 'sms' | 'whatsapp') => {
    if (!canResend || loading) return;
    setOtpChannel(channel);
    setErrorMsg(null);
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setResendTimer(30);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
    } catch (err: any) {
      setErrorMsg('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isFormLoading = loading || externalLoading;

  const cardBody = (
    <div className="space-y-5 text-left">
      {/* Step Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {step === 'phone' ? (
              <>
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <span>Phone Sign In</span>
              </>
            ) : (
              <>
                <KeyRound className="w-5 h-5 text-teal-400" />
                <span>Verify Code</span>
              </>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {step === 'phone'
              ? 'Enter your mobile number to receive a one-time passcode'
              : `Code sent to ${fullPhoneNumber}`}
          </p>
        </div>

        {step === 'otp' && (
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setErrorMsg(null);
            }}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: Phone Input Form */}
      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 block">Mobile Phone Number</label>
            <div className="flex rounded-xl bg-slate-900/80 border border-slate-700/70 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all overflow-hidden">
              {/* Country Selector */}
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="bg-slate-800/90 text-slate-200 text-xs font-bold px-3 py-3 border-r border-slate-700/70 outline-none cursor-pointer hover:bg-slate-800 transition-colors"
              >
                {COUNTRY_CODES.map((item) => (
                  <option key={item.code} value={item.code} className="bg-slate-900 text-slate-200">
                    {item.flag} {item.code}
                  </option>
                ))}
              </select>

              {/* Phone Input */}
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="98765 43210"
                className="w-full bg-transparent px-3.5 py-3 text-white text-sm font-medium placeholder-slate-500 outline-none"
                autoFocus={!embedded}
              />
            </div>
          </div>

          {/* Delivery Channel selection preview */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 px-0.5">
            <span className="flex items-center gap-1 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Standard SMS / WhatsApp rate applies
            </span>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={isFormLoading || !cleanPhone}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2"
          >
            {isFormLoading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <>
                <span>Send Verification Code</span>
                <ArrowRight className="w-4 h-4 ml-1 stroke-[2.5]" />
              </>
            )}
          </button>

          {/* Toggle to Google / Alternate Auth */}
          {onBackToGoogle && !embedded && (
            <div className="pt-3 border-t border-slate-800/80 text-center">
              <button
                type="button"
                onClick={onBackToGoogle}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium inline-flex items-center gap-1.5"
              >
                <span>Or sign in with Google</span>
              </button>
            </div>
          )}
        </form>
      ) : (
        /* STEP 2: OTP Verification Form */
        <form onSubmit={handleVerifyOtp} className="space-y-5 pt-1">
          <div className="space-y-2 text-center">
            <label className="text-xs font-semibold text-slate-300 block">
              Enter 6-digit verification code
            </label>

            {/* 6 Digit Box Inputs */}
            <div className="flex justify-center gap-2 sm:gap-2.5">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpInputsRef.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  onPaste={handleOtpPaste}
                  className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-black rounded-xl bg-slate-900/90 border transition-all outline-none ${
                    digit
                      ? 'border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
                      : 'border-slate-700/80 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Submit Verification */}
          <button
            type="submit"
            disabled={isFormLoading || otp.join('').length < 6}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFormLoading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>Verify &amp; Continue</span>
              </>
            )}
          </button>

          {/* Resend Options & Timer */}
          <div className="pt-3 border-t border-slate-800/80 space-y-3 text-center">
            {resendTimer > 0 ? (
              <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span>Resend code in <strong className="text-emerald-400">{resendTimer}s</strong></span>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Didn't receive the code?</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResendOtp('sms')}
                    disabled={isFormLoading}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 border border-slate-700"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-400" />
                    <span>Resend SMS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResendOtp('whatsapp')}
                    disabled={isFormLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-300 transition-colors flex items-center gap-1.5 border border-emerald-500/30"
                  >
                    <MessageSquare className="w-3 h-3 text-emerald-400" />
                    <span>WhatsApp OTP</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* Footer Security Note */}
      <div className="pt-4 border-t border-white/5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>256-bit Encrypted &bull; Instant OTP Verification</span>
      </div>
    </div>
  );

  if (embedded) {
    return cardBody;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#060a12] text-slate-100 font-sans">
      {/* Dynamic ambient light glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[320px] h-[320px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-10 left-10 w-[250px] h-[250px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 p-[2px] shadow-xl shadow-emerald-500/20 mb-1 hover:scale-105 transition-transform">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
              <Zap className="w-7 h-7 text-emerald-400" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              Handychapter
            </span>
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            100-Point Score Engine &amp; WhatsApp Direct Outreach
          </p>
        </div>

        {/* Main Glass Card Container */}
        <GlassCard glow className="p-6 sm:p-8 space-y-6 border-white/10 shadow-2xl backdrop-blur-xl">
          {cardBody}
        </GlassCard>

        {/* Footer Credits */}
        <div className="text-center space-y-2">
          <div className="text-xs sm:text-sm font-medium text-slate-300 flex items-center justify-center gap-1.5 flex-wrap">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-rose-500 fill-current animate-pulse shrink-0" />
            <span>by</span>
            <strong className="text-white font-black text-sm sm:text-base">Handysolver</strong>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
            <a
              href="/homepage.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors underline"
            >
              App Overview
            </a>
            <span>&bull;</span>
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors underline"
            >
              Privacy Policy
            </a>
            <span>&bull;</span>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneloginScreen;
