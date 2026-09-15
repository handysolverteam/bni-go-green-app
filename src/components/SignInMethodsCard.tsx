import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { UniversalModal } from './UniversalModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { describeAuthError, RECAPTCHA_CONTAINER_ID, PROVIDER_GOOGLE, PROVIDER_PHONE } from '../lib/firebase';
import { KeyRound, Smartphone, Link2, Unlink, Check, AlertCircle, ArrowLeft } from 'lucide-react';

const COUNTRY_CODES = ['+91', '+1', '+44', '+971', '+65', '+61'];

/**
 * Lets one account hold both sign-in methods, so signing in by phone and by Google
 * reaches the same chapter account instead of creating two separate ones.
 */
export const SignInMethodsCard: React.FC = () => {
  const { user, requestPhoneLink, confirmPhoneLinkCode, linkGoogle, unlinkMethod, cancelPhoneOtp } = useAuth();
  const { showToast } = useToast();

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supabase-authenticated sessions are not Firebase accounts, so linking does not apply.
  if (!user || user.provider === 'supabase') return null;

  const providers = user.providers ?? [];
  const hasGoogle = providers.includes(PROVIDER_GOOGLE);
  const hasPhone = providers.includes(PROVIDER_PHONE);
  const linkedCount = providers.length;

  const closePhoneModal = () => {
    cancelPhoneOtp();
    setShowPhoneModal(false);
    setStep('phone');
    setPhone('');
    setCode('');
    setErrorMsg(null);
  };

  const handleSendCode = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      setErrorMsg('Enter a valid mobile number.');
      return;
    }

    setBusy('send');
    setErrorMsg(null);
    try {
      await requestPhoneLink(`${countryCode}${digits}`);
      setStep('otp');
    } catch (err: any) {
      console.error('Phone link send failed:', err);
      setErrorMsg(describeAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmCode = async () => {
    if (code.replace(/\D/g, '').length < 6) {
      setErrorMsg('Enter the full 6-digit code.');
      return;
    }

    setBusy('confirm');
    setErrorMsg(null);
    try {
      await confirmPhoneLinkCode(code.replace(/\D/g, ''));
      showToast('Phone number added to your account.', 'success');
      closePhoneModal();
    } catch (err: any) {
      console.error('Phone link confirm failed:', err);
      setErrorMsg(describeAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleLinkGoogle = async () => {
    setBusy(PROVIDER_GOOGLE);
    try {
      await linkGoogle();
      showToast('Google sign-in added to your account.', 'success');
    } catch (err: any) {
      console.error('Google link failed:', err);
      showToast(describeAuthError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async (providerId: string, label: string) => {
    setBusy(providerId);
    try {
      await unlinkMethod(providerId);
      showToast(`${label} removed from your account.`, 'info');
    } catch (err: any) {
      console.error('Unlink failed:', err);
      showToast(err?.message || describeAuthError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const methodRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    detail: string,
    linked: boolean,
    onLink: () => void,
  ) => (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/50 border border-white/10">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-slate-800 border border-white/10 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-white">{label}</p>
          <p className="text-[11px] text-slate-400 font-medium truncate">{detail}</p>
        </div>
      </div>

      {linked ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            Linked
          </span>
          {linkedCount > 1 && (
            <button
              type="button"
              onClick={() => handleUnlink(key, label)}
              disabled={busy !== null}
              title={`Remove ${label}`}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition-colors disabled:opacity-50"
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onLink}
          disabled={busy !== null}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold border border-emerald-500/30 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === key ? (
            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
          <span>Add</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <GlassCard className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-400" />
            <span>Sign-in Methods</span>
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">
            Link both so you reach this same chapter account whichever way you sign in.
          </p>
        </div>

        {methodRow(
          PROVIDER_GOOGLE,
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>,
          'Google',
          hasGoogle ? (user.email || 'Google account') : 'Not connected',
          hasGoogle,
          handleLinkGoogle,
        )}

        {methodRow(
          PROVIDER_PHONE,
          <Smartphone className="w-4 h-4 text-emerald-400" />,
          'Phone (OTP)',
          hasPhone ? (user.phoneNumber || 'Verified number') : 'Not connected',
          hasPhone,
          () => setShowPhoneModal(true),
        )}

        {linkedCount <= 1 && (
          <p className="text-[11px] text-slate-500 font-medium flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Your only sign-in method cannot be removed. Add the other one first.</span>
          </p>
        )}
      </GlassCard>

      <UniversalModal
        isOpen={showPhoneModal}
        onClose={() => busy === null && closePhoneModal()}
        title={step === 'phone' ? 'Add Phone Sign-in' : 'Verify Your Number'}
        icon={<Smartphone className="w-6 h-6 text-emerald-400" />}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {step === 'phone' ? (
            <>
              <p className="text-xs text-slate-300 leading-relaxed">
                We will text a 6-digit code to confirm the number is yours. Afterwards you can
                sign in with either Google or this number.
              </p>

              <div className="flex rounded-xl bg-slate-900/80 border border-slate-700/70 overflow-hidden focus-within:border-emerald-500">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-slate-800/90 text-slate-200 text-xs font-bold px-3 py-3 border-r border-slate-700/70 outline-none cursor-pointer"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c} value={c} className="bg-slate-900">{c}</option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setErrorMsg(null); }}
                  placeholder="98765 43210"
                  className="w-full bg-transparent px-3.5 py-3 text-white text-sm font-medium placeholder-slate-500 outline-none"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-300 leading-relaxed">
                Enter the 6-digit code sent to{' '}
                <span className="font-black text-white">{countryCode} {phone.replace(/\D/g, '')}</span>.
              </p>

              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErrorMsg(null); }}
                placeholder="123456"
                className="w-full px-3.5 py-3 rounded-xl glass-input text-center text-lg font-black tracking-[0.4em] text-emerald-300"
              />

              <button
                type="button"
                onClick={() => { setStep('phone'); setCode(''); setErrorMsg(null); cancelPhoneOtp(); }}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Use a different number</span>
              </button>
            </>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Invisible reCAPTCHA must exist in the DOM before the SMS request runs. */}
          <div id={RECAPTCHA_CONTAINER_ID} />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              onClick={closePhoneModal}
              disabled={busy !== null}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={step === 'phone' ? handleSendCode : handleConfirmCode}
              disabled={busy !== null}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-xs transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              {busy !== null ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{step === 'phone' ? 'Sending...' : 'Verifying...'}</span>
                </>
              ) : (
                <span>{step === 'phone' ? 'Send Code' : 'Verify & Link'}</span>
              )}
            </button>
          </div>
        </div>
      </UniversalModal>
    </>
  );
};
