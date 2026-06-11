/*
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    '[supabaseClient] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    // Automatically refreshes the session before it expires.
    autoRefreshToken: true,
    // Persists the session across page reloads (localStorage).
    persistSession: true,
    // Detects auth tokens in the URL hash after OAuth redirect.
    detectSessionInUrl: true,
  },
});
*/
export const supabase = null;

