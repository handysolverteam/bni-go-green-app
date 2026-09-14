/** Query parameters an invite link may carry the 6-digit chapter code in. */
const INVITE_PARAMS = ['join', 'join_code', 'code'];

/** localStorage key holding a not-yet-used invite code. */
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

/**
 * Strips the invite parameters from the address bar without reloading.
 *
 * The app routes on the hash and never rewrites the query string, so an invite code left
 * in the URL survives refreshes, sign-outs, and account switches — it would keep being
 * offered to whoever is looking at the onboarding screen.
 */
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

/** Forgets any stored invite code. */
export function clearPendingInviteCode() {
  try {
    localStorage.removeItem(PENDING_JOIN_CODE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked cookies) — nothing to forget.
  }
}

/**
 * Returns the pending invite code and clears it from both the URL and storage.
 *
 * An invite code is a one-shot hint from a shared link, not durable state, so reading it
 * consumes it.
 */
export function consumeInviteCode(): string | null {
  const urlCode = readInviteCodeFromUrl();
  let storedCode: string | null = null;
  try {
    storedCode = localStorage.getItem(PENDING_JOIN_CODE_KEY);
  } catch {
    storedCode = null;
  }

  clearPendingInviteCode();
  clearInviteCodeFromUrl();

  const code = urlCode || storedCode;
  return code && code.trim() ? code.trim() : null;
}
