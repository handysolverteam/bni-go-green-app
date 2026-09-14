// Deletes the *calling* user's Supabase auth account.
//
// Why this exists: removing an auth user requires the service_role key, which must never be
// shipped to the browser. The client calls this function with its normal session JWT; the
// function verifies that JWT, then uses service_role to delete only that user.
//
// Deploy:
//   supabase functions deploy delete-user
//
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets are injected automatically by the
// Supabase platform. Do NOT add them to the app's .env — anything VITE_-prefixed is public.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Resolve the caller from their own JWT. This is the authorization check:
    //    a user can only ever delete the identity encoded in the token they presented.
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Invalid or expired session.' }, 401);
    }

    // 2. Refuse if the caller is still the sole owner of a chapter that has other members,
    //    mirroring the client-side guard so the rule cannot be bypassed by calling directly.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: myMemberships } = await admin
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id);

    for (const membership of myMemberships ?? []) {
      if (membership.role !== 'owner') continue;

      const { data: peers } = await admin
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', membership.org_id);

      const owners = (peers ?? []).filter((p) => p.role === 'owner');
      const others = (peers ?? []).filter((p) => p.user_id !== user.id);

      if (owners.length === 1 && others.length > 0) {
        return json(
          { error: 'You are the only Owner of a chapter that still has members. Transfer ownership first.' },
          409,
        );
      }
    }

    // 3. Delete the auth user. Personal rows are removed by the client beforehand; this is
    //    the identity itself, which only service_role can remove.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return json({ error: deleteError.message }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
