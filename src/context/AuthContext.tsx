import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { signInWithGoogleFirebase, signOutFirebase, firebaseAuth, deleteFirebaseAccount } from '../lib/firebase';
import { supabase, signInWithGoogleSupabase, signOutSupabase } from '../lib/supabase';
import { onAuthStateChanged } from 'firebase/auth';
import { supabaseService } from '../services/supabaseService';

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
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithGoogle: async () => {},
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

  useEffect(() => {
    // 1. Check Firebase Auth State
    const unsubscribeFirebase = onAuthStateChanged(firebaseAuth, (fbUser) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Member',
          photoURL: fbUser.photoURL || null,
          provider: 'google',
        });
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

  const logout = async () => {
    setLoading(true);
    loggingOutRef.current = true;
    try {
      clearCachedAppData();

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

      // Supabase-authenticated users cannot be deleted from the browser (that needs the
      // service_role admin API), so their login survives — report it rather than pretend.
      let loginRetained = false;
      try {
        const deleted = await deleteFirebaseAccount();
        loginRetained = !deleted;
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
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
