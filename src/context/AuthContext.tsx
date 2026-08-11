import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { signInWithGoogleFirebase, signOutFirebase, firebaseAuth } from '../lib/firebase';
import { supabase, signInWithGoogleSupabase, signOutSupabase } from '../lib/supabase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      } else {
        // 2. Check Supabase Auth State if Firebase is null
        supabase.auth.getSession().then(({ data: { session } }) => {
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
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
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
    try {
      await signOutFirebase();
      await signOutSupabase();
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
