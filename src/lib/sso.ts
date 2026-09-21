/**
 * Cross-app SSO bridge with other trusted apps sharing this Firebase project (currently just
 * bni-rrc, at https://bni-rrc.vercel.app) -- separate domains, so no cookie can be shared
 * between them. The contract is `?sso=issue|callback|logout` on a partner's ROOT url (not a
 * dedicated path), since this app is a hash-routed SPA with no server-side rewrites and can
 * only reliably serve `/` -- and a query-string contract works on any host/stack, which
 * matters as more apps join this mesh later.
 *
 * Whichever app has no session redirects to a partner's `/?sso=issue`, which -- if it DOES
 * have a session -- mints a short-lived one-time code and redirects back with it; the
 * receiving app trades that code for a Firebase custom token and signs in silently. If that
 * partner had no session either, the chain tries the next one in the list before finally
 * falling back to this app's own login screen. See bni-rrc's components/AppShell.tsx + this
 * app's `?sso=...` handling in App.tsx for the other half of this flow.
 */

import { firebaseAuth } from './firebase';
import { signInWithCustomToken } from 'firebase/auth';

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

/**
 * Runs on this app's own /sso/issue role: called when a partner has no session and redirected
 * here to check whether we do. If signed in, hands back a one-time code; otherwise says so, so
 * the caller can try the next partner (or its own login screen) instead of looping.
 */
export async function issueSsoHandoff(returnUrl: string) {
  const finish = (query: string) => {
    const separator = returnUrl.includes('?') ? '&' : '?';
    window.location.replace(`${returnUrl}${separator}${query}`);
  };

  const current = firebaseAuth.currentUser;
  if (!current) {
    finish('ssoCode=none');
    return;
  }

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
