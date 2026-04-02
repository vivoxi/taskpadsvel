import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }

  client = createClient(supabaseUrl, supabaseServiceKey);
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  }
});
