// Server-side Firebase admin operations for the cross-app SSO bridge with bni-rrc.
//
// Implemented with `jose` (via esm.sh) rather than the `firebase-admin` npm package, which
// depends on Node/gRPC internals that don't run on Deno edge functions. The exact same logic
// lives in bni-rrc's lib/firebase/admin.ts (Node/jose) so both sides of the bridge behave
// identically; keep the two in sync if this changes.
//
// Required secrets (supabase secrets set ...):
//   FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY

import { SignJWT, createRemoteJWKSet, jwtVerify, importPKCS8 } from 'https://esm.sh/jose@6';

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')!;
const FIREBASE_DATABASE_URL = Deno.env.get('FIREBASE_DATABASE_URL')!;
const ADMIN_CLIENT_EMAIL = Deno.env.get('FIREBASE_ADMIN_CLIENT_EMAIL')!;
const ADMIN_PRIVATE_KEY = (Deno.env.get('FIREBASE_ADMIN_PRIVATE_KEY') || '').replace(/\\n/g, '\n');

/** SSO exchange codes are single-use and only need to survive one redirect round trip. */
const SSO_CODE_TTL_MS = 60_000;

function assertConfigured() {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_DATABASE_URL || !ADMIN_CLIENT_EMAIL || !ADMIN_PRIVATE_KEY) {
    throw new Error('Firebase admin secrets are not configured for this function.');
  }
}

let cachedPrivateKey: CryptoKey | null = null;
async function getPrivateKey(): Promise<CryptoKey> {
  if (!cachedPrivateKey) {
    cachedPrivateKey = await importPKCS8(ADMIN_PRIVATE_KEY, 'RS256');
  }
  return cachedPrivateKey;
}

/** Mints a Firebase custom token for `uid`, redeemable client-side via signInWithCustomToken. */
export async function mintFirebaseCustomToken(uid: string): Promise<string> {
  assertConfigured();
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ uid, claims: {} })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(ADMIN_CLIENT_EMAIL)
    .setSubject(ADMIN_CLIENT_EMAIL)
    .setAudience(
      'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    )
    .sign(key);
}

const idTokenJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Verifies a Firebase ID token the browser sent up, returning the signed-in user's uid. */
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string }> {
  const { payload } = await jwtVerify(idToken, idTokenJwks, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });

  if (typeof payload.sub !== 'string') {
    throw new Error('ID token is missing a subject claim.');
  }

  return { uid: payload.sub };
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

/** Keyed by scope string -- RTDB and Identity Toolkit access tokens are cached separately. */
const accessTokenCache = new Map<string, CachedAccessToken>();

/** Google OAuth2 access token for the service account, scoped for a specific Google API. */
async function getGoogleAccessToken(scope: string): Promise<string> {
  assertConfigured();

  const cached = accessTokenCache.get(scope);
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }

  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(ADMIN_CLIENT_EMAIL)
    .setSubject(ADMIN_CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to obtain Google access token: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  accessTokenCache.set(scope, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

async function rtdbFetch(path: string, init: RequestInit) {
  // Both scopes are required together -- firebase.database alone gets "Unauthorized request."
  // from the RTDB REST API even with a valid, correctly-signed assertion.
  const accessToken = await getGoogleAccessToken(
    'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  );
  return fetch(`${FIREBASE_DATABASE_URL}/${path}.json`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Reads a Firebase user's custom claims via the Identity Toolkit Admin REST API (no
 * firebase-admin package needed, same reasoning as the rest of this file -- it doesn't
 * run on Deno). Returns {} for a user with no custom claims set yet.
 */
export async function getFirebaseUserClaims(uid: string): Promise<Record<string, unknown>> {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/identitytoolkit');

  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ localId: [uid] }),
  });

  if (!response.ok) {
    throw new Error(`Failed to look up Firebase user: ${await response.text()}`);
  }

  const data = (await response.json()) as { users?: Array<{ customAttributes?: string }> };
  const user = data.users?.[0];
  if (!user) throw new Error('Firebase user not found.');

  return user.customAttributes ? JSON.parse(user.customAttributes) : {};
}

/**
 * Sets a Firebase user's FULL set of custom claims (this REST API replaces, not merges --
 * callers must pass the complete object, e.g. spread the result of getFirebaseUserClaims()
 * first if anything else is already set).
 */
export async function setFirebaseUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const accessToken = await getGoogleAccessToken('https://www.googleapis.com/auth/identitytoolkit');

  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set Firebase user claims: ${await response.text()}`);
  }
}

/** Stores a one-time SSO exchange code -> uid mapping, shared across both apps via the RTDB. */
export async function putSsoExchangeCode(code: string, uid: string): Promise<void> {
  const response = await rtdbFetch(`ssoExchange/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, createdAt: Date.now() }),
  });

  if (!response.ok) {
    throw new Error(`Failed to store SSO exchange code: ${await response.text()}`);
  }
}

/** Redeems a one-time SSO exchange code, deleting it so it cannot be reused. Returns the uid, or null if missing/expired. */
export async function consumeSsoExchangeCode(code: string): Promise<string | null> {
  const getResponse = await rtdbFetch(`ssoExchange/${code}`, { method: 'GET' });
  if (!getResponse.ok) {
    throw new Error(`Failed to read SSO exchange code: ${await getResponse.text()}`);
  }

  const record = (await getResponse.json()) as { uid: string; createdAt: number } | null;

  // Always delete on read so a leaked/reused code cannot be redeemed twice.
  await rtdbFetch(`ssoExchange/${code}`, { method: 'DELETE' }).catch(() => {});

  if (!record || Date.now() - record.createdAt > SSO_CODE_TTL_MS) {
    return null;
  }

  return record.uid;
}
