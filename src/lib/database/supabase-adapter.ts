// Supabase adapter — wraps the Supabase client with error logging.
// In Supabase mode, the real @supabase/supabase-js client does all the work;
// this wrapper just adds console logging for diagnostics.

import { createClient } from '@supabase/supabase-js';
import { logInit, dbLog } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  dbLog('error', 'init', 'Missing Supabase environment variables', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
  });
  throw new Error('Missing Supabase environment variables. Check .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

logInit(`Supabase client created (URL: ${supabaseUrl.slice(0, 20)}...)`);
