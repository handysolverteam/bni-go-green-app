// Called by this app's own /sso/issue view when the bni-rrc app has no session, so it can
// check whether Handychapter does. Exchanges the caller's Firebase ID token for a short-lived,
// single-use code rather than handing back a raw custom token, so a code leaked via browser
// history/logs is far less useful than a bearer credential would be.
//
// Deploy: supabase functions deploy sso-issue

import { verifyFirebaseIdToken, putSsoExchangeCode } from '../_shared/firebaseAdmin.ts';

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
    const code = crypto.randomUUID();
    await putSsoExchangeCode(code, uid);
    return json({ code }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to issue SSO code.' }, 401);
  }
});
