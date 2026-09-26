// RBAC Phase 2 (see the approved RBAC plan): Supabase's Third-Party Auth for Firebase
// requires every Firebase ID token to carry a `role: "authenticated"` custom claim --
// without it, Postgres/PostgREST won't resolve the caller to the `authenticated` role even
// once the token's signature verifies. Firebase never sets this on its own, so it's granted
// here, server-side, using the same Admin SDK credentials already used by the SSO bridge.
// Called from the client on every sign-in (src/lib/firebase.ts's ensureFirebaseRoleClaim);
// a no-op after the first successful call for a given user.
//
// Deploy: supabase functions deploy ensure-role-claim --no-verify-jwt
// (must run with verify_jwt off, same as sso-issue/sso-consume: the bearer here is a
// Firebase ID token, not a Supabase-issued JWT, so Supabase's own gateway-level JWT check
// would reject it before this code ever ran.)

import { verifyFirebaseIdToken, getFirebaseUserClaims, setFirebaseUserClaims } from '../_shared/firebaseAdmin.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!idToken) {
    return json({ error: 'Missing bearer token.' }, 401);
  }

  try {
    const { uid } = await verifyFirebaseIdToken(idToken);
    const claims = await getFirebaseUserClaims(uid);

    if (claims.role === 'authenticated') {
      return json({ updated: false }, 200);
    }

    await setFirebaseUserClaims(uid, { ...claims, role: 'authenticated' });
    return json({ updated: true }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to set role claim.' }, 500);
  }
});
