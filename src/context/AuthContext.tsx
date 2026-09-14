import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import {
  signInWithGoogleFirebase,
  signOutFirebase,
  firebaseAuth,
  deleteFirebaseAccount,
  sendPhoneOtp,
  confirmPhoneOtp,
  clearRecaptcha,
  getLinkedProviders,
  startPhoneLink,
  confirmPhoneLink,
  linkGoogleToCurrentUser,
  unlinkProvider,
  reloadFirebaseUser,
  PROVIDER_GOOGLE,
  PROVIDER_PHONE,
} from '../lib/firebase';
import { supabase, signInWithGoogleSupabase, signOutSupabase } from '../lib/supabase';
import { onAuthStateChanged, type ConfirmationResult, type User as FirebaseUser } from 'firebase/auth';
import { supabaseService } from '../services/supabaseService';

/** Maps a Firebase auth user onto the app's UserProfile shape. */
const fromFirebaseUser = (fbUser: FirebaseUser): UserProfile => {
  const providers = getLinkedProviders(fbUser);
  // An account can hold both methods once linked; Google is the richer identity, so it
  // wins the single `provider` label while `providers` carries the full truth.
  const isPhoneOnly = providers.includes(PROVIDER_PHONE) && !providers.includes(PROVIDER_GOOGLE);
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    // Phone-only accounts carry no displayName or email, so the number is the only label.
    displayName: fbUser.displayName || fbUser.email?.split('@')[0] || fbUser.phoneNumber || 'Member',
    photoURL: fbUser.photoURL || null,
    phoneNumber: fbUser.phoneNumber || null,
    providers,
    provider: isPhoneOnly ? 'phone' : 'google',
  };
};

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
  /** True when app data was deleted but the identity provider account could not be removed client-side. */
  loginRetained?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  /** Sends an SMS code to an E.164 number. Call verifyPhoneOtp() next. */
  requestPhoneOtp: (e164Phone: string) => Promise<void>;
  /** Completes phone sign-in with the code from the SMS. */
  verifyPhoneOtp: (code: string) => Promise<void>;
  /** Discards a pending OTP challenge (e.g. the user went back to edit the number). */
  cancelPhoneOtp: () => void;
  /** Sends an SMS code to attach a number to the CURRENT account (not a new sign-in). */
  requestPhoneLink: (e164Phone: string) => Promise<void>;
  /** Completes attaching the phone number with the SMS code. */
  confirmPhoneLinkCode: (code: string) => Promise<void>;
  /** Attaches a Google identity to the current account. */
  linkGoogle: () => Promise<void>;
  /** Detaches a sign-in method; refuses to remove the last one. */
  unlinkMethod: (providerId: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithGoogle: async () => {},
  requestPhoneOtp: async () => {},
  verifyPhoneOtp: async () => {},
  cancelPhoneOtp: () => {},
  requestPhoneLink: async () => {},
  confirmPhoneLinkCode: async () => {},
  linkGoogle: async () => {},
  unlinkMethod: async () => {},
  logout: async () => {},
  deleteAccount: async () => ({ ok: false }),
});

/** Cached keys wiped on sign-out and account deletion. */
const CACHE_KEYS = [
  'bni_cached_org',
  'bni_cached_org_member',
  'bni_cached_profile',
  'bni_cached_members',
  'bni_cached_import_logs',
  'bni_active_tab',
  'bni_active_report',
];

export const clearCachedAppData = () => {
  CACHE_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch {}
  });
  try { sessionStorage.clear(); } catch {}
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loggingOutRef = useRef(false);
  const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    // Failsafe: the app blocks on a splash while `loading` is true, so if neither provider
    // ever reports back (misconfigured Firebase, offline, blocked third-party storage) we
    // must still resolve — otherwise the splash hangs forever instead of offering sign-in.
    const failsafe = setTimeout(() => setLoading(false), 5000);

    // 1. Check Firebase Auth State
    const unsubscribeFirebase = onAuthStateChanged(firebaseAuth, (fbUser) => {
      clearTimeout(failsafe);
      if (fbUser) {
        setUser(fromFirebaseUser(fbUser));
        setLoading(false);
      } else if (!loggingOutRef.current) {
        // 2. Check Supabase Auth State if Firebase is null (skip while logging out)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (loggingOutRef.current) {
            setUser(null);
            setLoading(false);
            return;
          }
          if (session?.user) {
            const googleAvatar =
              session.user.user_metadata?.avatar_url ||
              session.user.user_metadata?.picture ||
              session.user.user_metadata?.photo_url ||
              session.user.user_metadata?.avatar ||
              null;

            setUser({
              uid: session.user.id,
              email: session.user.email || null,
              displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Director',
              photoURL: googleAvatar,
              provider: 'supabase',
            });
          } else {
            setUser(null);
          }
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (loggingOutRef.current) return;
      if (session?.user && !firebaseAuth.currentUser) {
        const googleAvatar =
          session.user.user_metadata?.avatar_url ||
          session.user.user_metadata?.picture ||
          session.user.user_metadata?.photo_url ||
          session.user.user_metadata?.avatar ||
          null;

        setUser({
          uid: session.user.id,
          email: session.user.email || null,
          displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Director',
          photoURL: googleAvatar,
          provider: 'supabase',
        });
      }
    });

    return () => {
      clearTimeout(failsafe);
      unsubscribeFirebase();
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogleFirebase();
    } catch (fbErr) {
      console.warn('Firebase login attempt failed/fallback to Supabase OAuth:', fbErr);
      await signInWithGoogleSupabase();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 1 of phone sign-in. The ConfirmationResult is held in a ref rather than state
   * because it is a non-serialisable handle used only by the verify step, and re-rendering
   * on it would serve no purpose.
   */
  const requestPhoneOtp = async (e164Phone: string) => {
    const confirmation = await sendPhoneOtp(e164Phone);
    phoneConfirmationRef.current = confirmation;
  };

  /**
   * Step 2 of phone sign-in. onAuthStateChanged picks the session up from here.
   *
   * Deliberately does NOT touch the global `loading` flag: App renders a full-screen splash
   * while it is true, which would unmount the OTP form mid-verification and discard the
   * entered code and error message on a wrong entry. The form shows its own spinner.
   */
  const verifyPhoneOtp = async (code: string) => {
    const confirmation = phoneConfirmationRef.current;
    if (!confirmation) {
      throw new Error('That verification session has expired. Request a new code.');
    }

    await confirmPhoneOtp(confirmation, code);
    phoneConfirmationRef.current = null;
  };

  const cancelPhoneOtp = () => {
    phoneConfirmationRef.current = null;
    clearRecaptcha();
  };

  /**
   * Linking mutates the current user in place, which does NOT re-fire onAuthStateChanged,
   * so provider data must be pulled explicitly or the UI keeps showing the old methods.
   */
  const refreshLinkedProviders = async () => {
    const fresh = await reloadFirebaseUser();
    if (fresh) setUser(fromFirebaseUser(fresh));
  };

  const requestPhoneLink = async (e164Phone: string) => {
    phoneConfirmationRef.current = await startPhoneLink(e164Phone);
  };

  const confirmPhoneLinkCode = async (code: string) => {
    const confirmation = phoneConfirmationRef.current;
    if (!confirmation) {
      throw new Error('That verification session has expired. Request a new code.');
    }

    await confirmPhoneLink(confirmation, code);
    phoneConfirmationRef.current = null;
    await refreshLinkedProviders();
  };

  const linkGoogle = async () => {
    await linkGoogleToCurrentUser();
    await refreshLinkedProviders();
  };

  const unlinkMethod = async (providerId: string) => {
    await unlinkProvider(providerId);
    await refreshLinkedProviders();
  };

  const logout = async () => {
    setLoading(true);
    loggingOutRef.current = true;
    try {
      clearCachedAppData();
      cancelPhoneOtp();

      await signOutFirebase();
      await signOutSupabase();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      setUser(null);
    } finally {
      setLoading(false);
      loggingOutRef.current = false;
    }
  };

  /**
   * Deletes the user's personal data, then their login, then signs them out.
   * Data is removed first: if the auth deletion fails the user can retry, whereas
   * deleting the login first would strand orphaned rows nobody can reach.
   */
  const deleteAccount = async (): Promise<DeleteAccountResult> => {
    if (!user?.uid) return { ok: false, error: 'You are not signed in.' };

    setLoading(true);
    try {
      const dataResult = await supabaseService.deleteUserAccount(user.uid, user.email);
      if (!dataResult.ok) {
        setLoading(false);
        return { ok: false, error: dataResult.error };
      }

      loggingOutRef.current = true;
      clearCachedAppData();

      // Firebase users can be deleted straight from the browser. Supabase users cannot —
      // that needs the service_role admin API — so they go through the `delete-user` Edge
      // Function instead (supabase/functions/delete-user). If neither path succeeds the app
      // data is still gone but the login survives; report that rather than pretend.
      let loginRetained = false;
      try {
        const deleted = await deleteFirebaseAccount();
        if (!deleted) {
          const { error: fnError } = await supabase.functions.invoke('delete-user');
          if (fnError) {
            console.error('delete-user Edge Function failed:', fnError);
            loginRetained = true;
          }
        }
      } catch (authErr: any) {
        console.error('Auth account deletion failed:', authErr);
        loginRetained = true;
      }

      try {
        await signOutFirebase();
        await signOutSupabase();
      } catch {}

      setUser(null);
      return { ok: true, loginRetained };
    } catch (err: any) {
      console.error('Delete account error:', err);
      return { ok: false, error: err?.message || 'Failed to delete account.' };
    } finally {
      setLoading(false);
      loggingOutRef.current = false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        requestPhoneOtp,
        verifyPhoneOtp,
        cancelPhoneOtp,
        requestPhoneLink,
        confirmPhoneLinkCode,
        linkGoogle,
        unlinkMethod,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
