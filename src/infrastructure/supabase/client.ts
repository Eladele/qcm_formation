import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies dans le fichier .env');
  }
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
