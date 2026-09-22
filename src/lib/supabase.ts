import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Firebase is the only identity provider; Supabase is the database only. Sign-out remains so
 * sessions created by the old Google-OAuth fallback still get cleared from browsers that have
 * one. There is deliberately no matching sign-in.
 */
export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
