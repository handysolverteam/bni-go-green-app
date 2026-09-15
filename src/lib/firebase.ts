import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  deleteUser,
  reauthenticateWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  linkWithPopup,
  unlink,
  type ConfirmationResult,
  type User as FirebaseUser,
} from 'firebase/auth';

export const PROVIDER_GOOGLE = 'google.com';
export const PROVIDER_PHONE = 'phone';

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

// Dev-only: prints which Firebase project the app is actually talking to. This project has
// switched Firebase projects before (see git history of .env), and a console-vs-app mismatch
// there looks identical to "I enabled it but it's not working" — a Firebase Console tab left
// open on the wrong project. One glance here rules that out immediately. Silent in production.
if (import.meta.env.DEV) {
  console.info('[Firebase] Active project:', firebaseConfig.projectId);
}

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
      // Re-auth must use the provider the account actually signed in with. The Google popup
      // cannot revalidate a phone account, so those users are asked to sign in again first
      // rather than being shown a confusing provider-mismatch error.
      const isPhoneAccount = current.providerData.some((p) => p.providerId === 'phone');
      if (isPhoneAccount) {
        throw new Error(
          'For security, please sign out and sign back in with your phone number, then delete your account again.'
        );
      }

      await reauthenticateWithPopup(current, googleProvider);
      await deleteUser(firebaseAuth.currentUser || current);
      return true;
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*  Phone (OTP) authentication                                                */
/* -------------------------------------------------------------------------- */

/** Element id the invisible reCAPTCHA widget mounts into. */
export const RECAPTCHA_CONTAINER_ID = 'firebase-recaptcha-container';

let recaptchaVerifier: RecaptchaVerifier | null = null;

/** Tears down the reCAPTCHA widget so the next send starts from a clean one. */
export function clearRecaptcha() {
  try {
    recaptchaVerifier?.clear();
  } catch {
    // Widget may already be detached; nothing to clean up.
  }
  recaptchaVerifier = null;

  const container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (container) container.innerHTML = '';
}

/**
 * Sends a 6-digit SMS code to an E.164 number (e.g. +919876543210).
 *
 * A reCAPTCHA token is single-use: reusing a verifier makes the second send fail with
 * 'auth/internal-error'. So the widget is rebuilt on every send, including resends.
 *
 * Returns the ConfirmationResult, which must be held to verify the code afterwards.
 */
export async function sendPhoneOtp(e164Phone: string): Promise<ConfirmationResult> {
  clearRecaptcha();

  recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, RECAPTCHA_CONTAINER_ID, {
    size: 'invisible',
  });

  try {
    return await signInWithPhoneNumber(firebaseAuth, e164Phone, recaptchaVerifier);
  } catch (error) {
    // A failed attempt leaves the widget in a state that cannot be reused.
    clearRecaptcha();
    throw error;
  }
}

/** Completes phone sign-in with the code the user received. */
export async function confirmPhoneOtp(confirmation: ConfirmationResult, code: string) {
  const result = await confirmation.confirm(code);
  clearRecaptcha();
  return result.user;
}

/** Turns Firebase auth error codes into something a user can act on. */
export function describeAuthError(error: any): string {
  switch (error?.code) {
    case 'auth/invalid-phone-number':
      return 'That phone number is not valid. Include your country code and try again.';
    case 'auth/missing-phone-number':
      return 'Please enter a phone number.';
    case 'auth/quota-exceeded':
      return 'SMS quota for this project has been exhausted. Try again later.';
    case 'auth/too-many-requests':
      return 'Too many attempts from this device. Wait a few minutes and try again.';
    case 'auth/invalid-verification-code':
      return 'That code is incorrect. Check the SMS and try again.';
    case 'auth/code-expired':
      return 'That code has expired. Request a new one.';
    case 'auth/captcha-check-failed':
      return 'Verification check failed. Reload the page and try again.';
    case 'auth/operation-not-allowed':
      return `Phone sign-in is not enabled for this project (${firebaseConfig.projectId}). ` +
        `Enable it in Firebase Console → Authentication → Sign-in method → Phone, ` +
        `making sure that project matches — not an old or different one.`;
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/provider-already-linked':
      return 'That sign-in method is already on this account.';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      // Two separate accounts already exist. Merging them needs the Admin SDK, so the
      // honest answer is that one has to go — we cannot silently combine them here.
      return 'That already belongs to a different Handychapter account. Sign in to that account instead, or remove it there before adding it here.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in, then try again.';
    case 'auth/no-such-provider':
      return 'That sign-in method is not on this account.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

/* -------------------------------------------------------------------------- */
/*  Account linking — one account, multiple sign-in methods                    */
/* -------------------------------------------------------------------------- */

/** Provider ids currently attached to the signed-in account. */
export function getLinkedProviders(user: FirebaseUser | null): string[] {
  return user?.providerData.map((p) => p.providerId) ?? [];
}

/**
 * Starts attaching a phone number to the CURRENT account.
 *
 * This differs from sendPhoneOtp(): that one signs a user in (creating a separate
 * account for the number), whereas this adds the number to the account already signed in.
 */
export async function startPhoneLink(e164Phone: string): Promise<ConfirmationResult> {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('You must be signed in to add a phone number.');

  clearRecaptcha();
  recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, RECAPTCHA_CONTAINER_ID, {
    size: 'invisible',
  });

  try {
    return await linkWithPhoneNumber(current, e164Phone, recaptchaVerifier);
  } catch (error) {
    clearRecaptcha();
    throw error;
  }
}

/** Completes phone linking with the SMS code. */
export async function confirmPhoneLink(confirmation: ConfirmationResult, code: string) {
  const result = await confirmation.confirm(code);
  clearRecaptcha();
  return result.user;
}

/** Attaches a Google identity to the current account via popup. */
export async function linkGoogleToCurrentUser() {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('You must be signed in to add Google sign-in.');

  const result = await linkWithPopup(current, googleProvider);
  return result.user;
}

/**
 * Detaches a sign-in method. Refuses to remove the last one, which would leave the
 * account unreachable.
 */
export async function unlinkProvider(providerId: string) {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('You must be signed in to change sign-in methods.');

  if (getLinkedProviders(current).length <= 1) {
    throw new Error('This is your only sign-in method. Add another before removing it.');
  }

  return unlink(current, providerId);
}

/** Pulls fresh provider data after a link/unlink, which does not re-fire onAuthStateChanged. */
export async function reloadFirebaseUser(): Promise<FirebaseUser | null> {
  const current = firebaseAuth.currentUser;
  if (!current) return null;
  await current.reload();
  return firebaseAuth.currentUser;
}
