import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!browser) return null;
  if (client) return client;

  const publicEnv = env as Record<string, string | undefined>;
  const url = publicEnv.PUBLIC_SUPABASE_URL || publicEnv.VITE_SUPABASE_URL;
  const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || publicEnv.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey);
  return client;
}
