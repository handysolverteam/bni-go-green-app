/**
 * Cross-app SSO bridge with other trusted apps sharing this Firebase project (currently
 * bni-rrc and bni-rrc-slips) -- separate domains, so no cookie can be shared between them. The
 * contract is `?sso=issue|callback|logout` on a partner's ROOT url (not a dedicated path),
 * since this app is a hash-routed SPA with no server-side rewrites and can only reliably serve
 * `/` -- and a query-string contract works on any host/stack.
 *
 * Handychapter is the single auth hub: the other two apps have no login screen of their own in
 * normal use. When a satellite has no session, it redirects here with `?sso=issue&return=...`.
 * If this app already has a session, issueSsoHandoff() mints a one-time code and bounces back
 * immediately. If not, it remembers the return URL (setPendingSsoReturn) and lets the normal
 * login screen render -- completePendingSsoHandoff() finishes the job once the user actually
 * signs in (see the effect in App.tsx watching `user`), so they're bounced back to the app they
 * came from without ever landing on Handychapter's dashboard first.
 *
 * startSsoHandoff/hasTriedSso/tryNextSsoPartner below are unused now that Handychapter never
 * needs to go looking for a session on another app -- kept rather than deleted in case a
 * future peer-to-peer use case needs them again.
 */

import { firebaseAuth } from './firebase';
import { signInWithCustomToken, type User as FirebaseUser } from 'firebase/auth';

const PENDING_SSO_RETURN_KEY = 'handychapter_pending_sso_return';

function getPendingSsoReturn(): string | null {
  try {
    return sessionStorage.getItem(PENDING_SSO_RETURN_KEY);
  } catch {
    return null;
  }
}

function setPendingSsoReturn(returnUrl: string) {
  try {
    sessionStorage.setItem(PENDING_SSO_RETURN_KEY, returnUrl);
  } catch {
    // Storage unavailable; the handoff simply can't be deferred -- the satellite's own
    // /login safety net takes over once its chain gives up.
  }
}

function clearPendingSsoReturn() {
  try {
    sessionStorage.removeItem(PENDING_SSO_RETURN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** True if a satellite is waiting on this tab to finish authenticating before bouncing back. */
export function hasPendingSsoReturn(): boolean {
  return getPendingSsoReturn() !== null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SSO_ATTEMPTED_KEY = 'handychapter_sso_attempted';

function functionUrl(name: string) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/**
 * Every OTHER trusted app sharing this Firebase project. A comma-separated env var rather than
 * a single URL so adding a third/fourth app later is just a config change, not a new code path.
 */
export function getSsoPartnerUrls(): string[] {
  const raw = (import.meta.env.VITE_SSO_PARTNER_URLS as string | undefined) || '';
  return raw
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** True once per browser session, so a down/misconfigured partner mesh doesn't loop forever. */
export function hasTriedSso(): boolean {
  try {
    return sessionStorage.getItem(SSO_ATTEMPTED_KEY) === '1';
  } catch {
    return true;
  }
}

function redirectToIssuer(partnerUrl: string, redirectHash: string, partnerIndex: number) {
  const callback = `${window.location.origin}/?sso=callback&redirect=${encodeURIComponent(
    redirectHash,
  )}&partnerIndex=${partnerIndex}`;
  window.location.replace(`${partnerUrl}/?sso=issue&return=${encodeURIComponent(callback)}`);
}

/**
 * Call when this app has no session and hasn't already tried this browser session. Starts the
 * partner chain at index 0; App.tsx's ?sso=callback handling advances through the rest.
 */
export function startSsoHandoff(): boolean {
  const partners = getSsoPartnerUrls();
  if (partners.length === 0) return false;

  try {
    sessionStorage.setItem(SSO_ATTEMPTED_KEY, '1');
  } catch {
    // Storage unavailable; proceed anyway, worst case is one extra redirect later.
  }

  redirectToIssuer(partners[0], window.location.hash || '#dashboard', 0);
  return true;
}

/** Continues the chain from ?sso=callback when a partner reported no session. */
export function tryNextSsoPartner(redirectHash: string, previousIndex: number): boolean {
  const partners = getSsoPartnerUrls();
  const nextIndex = previousIndex + 1;
  if (nextIndex >= partners.length) return false;

  redirectToIssuer(partners[nextIndex], redirectHash, nextIndex);
  return true;
}

async function mintCodeAndReturn(returnUrl: string, current: FirebaseUser) {
  const finish = (query: string) => {
    const separator = returnUrl.includes('?') ? '&' : '?';
    window.location.replace(`${returnUrl}${separator}${query}`);
  };

  try {
    const idToken = await current.getIdToken();
    const response = await fetch(functionUrl('sso-issue'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      finish('ssoCode=none');
      return;
    }

    const { code } = (await response.json()) as { code: string };
    finish(`ssoCode=${code}`);
  } catch {
    finish('ssoCode=none');
  }
}

/**
 * Runs on this app's own /sso/issue role (the single auth hub): called when a satellite has no
 * session and needs the user to authenticate here. Already signed in -> mint a code and bounce
 * back immediately, no UI shown. Not signed in -> remember the return URL and let the caller
 * fall through to the normal login screen; completePendingSsoHandoff() finishes the job once
 * sign-in succeeds.
 */
export async function issueSsoHandoff(returnUrl: string) {
  const current = firebaseAuth.currentUser;
  if (!current) {
    setPendingSsoReturn(returnUrl);
    return;
  }

  await mintCodeAndReturn(returnUrl, current);
}

/**
 * Call once `user` becomes non-null to finish a handoff that was deferred because the user
 * wasn't signed in yet when a satellite asked. No-op if nothing is pending.
 */
export async function completePendingSsoHandoff(): Promise<void> {
  const returnUrl = getPendingSsoReturn();
  clearPendingSsoReturn();
  if (!returnUrl) return;

  const current = firebaseAuth.currentUser;
  if (!current) return;

  await mintCodeAndReturn(returnUrl, current);
}

/**
 * Runs on this app's own /sso/callback role: trades the code a partner issued for a Firebase
 * custom token and signs in. Returns whether sign-in succeeded; the caller tries the next
 * partner (or falls back to the normal login screen) on false.
 */
export async function consumeSsoCallback(code: string): Promise<boolean> {
  try {
    const response = await fetch(functionUrl('sso-consume'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) return false;

    const { token } = (await response.json()) as { token: string };
    await signInWithCustomToken(firebaseAuth, token);
    return true;
  } catch {
    return false;
  }
}
