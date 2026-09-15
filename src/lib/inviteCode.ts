/**
 * Invite-link handling.
 *
 * Architecture: the code is captured EXACTLY ONCE per app session, by a single caller
 * (AppContent's top-level layout effect), into a ref that lives for the component's lifetime.
 * Every consumer downstream (the auto-join effect, the "already in a different chapter" notice,
 * OrgOnboardingScreen's prefill) reads that SAME stable value — none of them re-read the
 * mutable URL/localStorage signal themselves.
 *
 * That single change is what makes this safe: three previous bugs all traced back to the same
 * root cause — several independent effects/components each destructively reading-and-clearing
 * the same shared, mutable signal, so whichever one ran first "won" and the others silently saw
 * nothing. A React.StrictMode double-invoke of a single effect was enough to reproduce it.
 * Capturing once, up front, into an immutable-for-the-session value removes the race entirely:
 * there is nothing left to race over by the time anything downstream runs.
 */

/** Query parameters an invite link may carry the 6-digit chapter code in. */
const INVITE_PARAMS = ['join', 'join_code', 'code'];

/** localStorage key holding a not-yet-fully-handled invite code. */
export const PENDING_JOIN_CODE_KEY = 'pending_join_code';

/** Reads the invite code from the current URL, if a share link put one there. */
export function readInviteCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  for (const key of INVITE_PARAMS) {
    const value = params.get(key);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/** Strips the invite parameters from the address bar without reloading. */
export function clearInviteCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hadInvite = INVITE_PARAMS.some((key) => params.has(key));
  if (!hadInvite) return;

  INVITE_PARAMS.forEach((key) => params.delete(key));
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  );
}

/** Forgets any stored invite code. Call once the code has genuinely been acted on. */
export function clearPendingInviteCode() {
  try {
    localStorage.removeItem(PENDING_JOIN_CODE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked cookies) — nothing to forget.
  }
}

/**
 * Captures the invite code for this app session. The ONE and ONLY place this should be called
 * from is AppContent's top-level layout effect, guarded to run exactly once per mount.
 *
 * - Cleans the URL immediately (tidy address bar; a refresh can't re-trigger anything from it).
 * - If found in the URL, backs the code up to localStorage BEFORE clearing the URL, so it
 *   survives a full-page redirect if sign-in ends up using one. (Google's popup never
 *   navigates the page, so this only matters for the Supabase OAuth fallback used when the
 *   popup is blocked — the popup path never touches the URL at all.)
 * - Deliberately does NOT clear localStorage here — that happens later, once the code has
 *   actually been acted on (see clearPendingInviteCode()), so a redirect mid-login can still
 *   recover it on the fresh page load that follows.
 *
 * Returns the resolved 6-digit code (digits only), or null if none was present anywhere.
 */
export function captureInviteCode(): string | null {
  const urlCode = readInviteCodeFromUrl();
  let raw: string | null;

  if (urlCode) {
    clearInviteCodeFromUrl();
    try {
      localStorage.setItem(PENDING_JOIN_CODE_KEY, urlCode);
    } catch {
      // Storage unavailable — the code still works for this page load via the ref; it just
      // won't survive a redirect-based sign-in.
    }
    raw = urlCode;
  } else {
    try {
      raw = localStorage.getItem(PENDING_JOIN_CODE_KEY);
    } catch {
      raw = null;
    }
  }

  const digits = raw?.replace(/\D/g, '') || '';
  const code = digits.length === 6 ? digits : null;

  if (import.meta.env.DEV) {
    console.info('[InviteFlow] captureInviteCode() — source:', urlCode ? 'URL' : raw ? 'localStorage' : 'none', '-> code:', code || '(none)');
  }

  return code;
}
