import { createClient } from '@supabase/supabase-js';
import { firebaseAuth } from './firebase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

// Supabase Third-Party Auth trusts Firebase ID tokens directly, so RLS sees the Firebase UID
// as auth.jwt()->>'sub'. Returning null when signed out makes supabase-js send the anon key.
// Note: with accessToken set, every supabase.auth.* call throws -- Firebase owns identity.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => {
    try {
      return (await firebaseAuth.currentUser?.getIdToken()) ?? null;
    } catch {
      return null;
    }
  },
});
