import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const periodType = url.searchParams.get('periodType')?.trim();
  const periodKey = url.searchParams.get('periodKey')?.trim();
  const latest = url.searchParams.get('latest') === 'true';

  if (periodType !== 'weekly' && periodType !== 'monthly') {
    throw error(400, 'valid periodType is required');
  }

  let query = supabaseAdmin.from('history_snapshots').select('*').eq('period_type', periodType);

  if (periodKey) {
    const { data, error: queryError } = await query.eq('period_key', periodKey).maybeSingle();
    if (queryError) throw error(500, queryError.message);
    return json(data);
  }

  if (latest) {
    const { data, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (queryError) throw error(500, queryError.message);
    return json(data);
  }

  const { data, error: queryError } = await query.order('created_at', { ascending: false });
  if (queryError) throw error(500, queryError.message);
  return json(data ?? []);
};
