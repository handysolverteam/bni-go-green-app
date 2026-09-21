// Called by this app's own /sso/callback view with the code bni-rrc issued. Redeems the code
// (one-time, ~60s TTL) and mints a Firebase custom token so the browser can call
// signInWithCustomToken() here without ever showing a login form.
//
// Deploy: supabase functions deploy sso-consume

import { consumeSsoExchangeCode, mintFirebaseCustomToken } from '../_shared/firebaseAdmin.ts';

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

  const body = await req.json().catch(() => null) as { code?: string } | null;
  const code = body?.code;

  if (!code) {
    return json({ error: 'Missing code.' }, 400);
  }

  try {
    const uid = await consumeSsoExchangeCode(code);
    if (!uid) {
      return json({ error: 'That sign-in link has expired.' }, 400);
    }

    const token = await mintFirebaseCustomToken(uid);
    return json({ token }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Failed to complete SSO sign-in.' }, 500);
  }
});
