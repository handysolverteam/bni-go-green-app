import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  deleteUser,
  reauthenticateWithPopup,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogleFirebase() {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Firebase Google Sign-In Error:', error);
    throw error;
  }
}

export async function signOutFirebase() {
  return firebaseSignOut(firebaseAuth);
}

/**
 * Permanently deletes the signed-in Firebase auth user.
 * Firebase rejects deletion on a stale session ('auth/requires-recent-login'),
 * so we re-authenticate through the Google popup once and retry.
 * Returns false when there is no Firebase user (e.g. the Supabase OAuth path).
 */
export async function deleteFirebaseAccount(): Promise<boolean> {
  const current = firebaseAuth.currentUser;
  if (!current) return false;

  try {
    await deleteUser(current);
    return true;
  } catch (error: any) {
    if (error?.code === 'auth/requires-recent-login') {
      await reauthenticateWithPopup(current, googleProvider);
      await deleteUser(firebaseAuth.currentUser || current);
      return true;
    }
    throw error;
  }
}
