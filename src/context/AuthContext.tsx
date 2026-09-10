import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { supabase, signInWithGoogleSupabase, signOutSupabase } from '../lib/supabase';
import { supabaseService } from '../services/supabaseService';

/** Maps a Supabase auth user onto the app's UserProfile shape. */
const toUserProfile = (sbUser: any): UserProfile | null => {
  if (!sbUser) return null;
  const meta = sbUser.user_metadata || {};
  return {
    uid: sbUser.id,
    email: sbUser.email || null,
    displayName: meta.full_name || meta.name || sbUser.email?.split('@')[0] || 'Member',
    photoURL: meta.avatar_url || meta.picture || meta.photo_url || meta.avatar || null,
    provider: 'supabase',
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
    // Supabase is the sole identity provider, so auth.uid() resolves inside Postgres
    // and Row Level Security can actually scope data per user. (Firebase-authenticated
    // requests arrived as the `anon` role with auth.uid() = NULL, which made RLS
    // impossible to enforce.)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (loggingOutRef.current) {
        setUser(null);
      } else {
        setUser(toUserProfile(session?.user));
      }
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (loggingOutRef.current) return;
      setUser(toUserProfile(session?.user));
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      // Redirects away and back; onAuthStateChange picks up the session on return.
      await signInWithGoogleSupabase();
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    loggingOutRef.current = true;
    try {
      clearCachedAppData();

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

      // Deleting a Supabase auth user requires the service_role admin API, which must never
      // reach the browser — so it runs in the `delete-user` Edge Function (see
      // supabase/functions/delete-user). If that function is not deployed the app data is
      // still gone, but the login survives; report that rather than pretend otherwise.
      let loginRetained = false;
      try {
        const { error: fnError } = await supabase.functions.invoke('delete-user');
        if (fnError) {
          console.error('delete-user Edge Function failed:', fnError);
          loginRetained = true;
        }
      } catch (authErr: any) {
        console.error('Auth account deletion failed:', authErr);
        loginRetained = true;
      }

      try {
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
