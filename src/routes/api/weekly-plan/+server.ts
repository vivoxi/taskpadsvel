import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const weekKey = url.searchParams.get('weekKey')?.trim() ?? '';
  if (!weekKey) {
    throw error(400, 'weekKey is required');
  }

  const { data, error: queryError } = await supabaseAdmin
    .from('weekly_plan')
    .select('*')
    .eq('week_key', weekKey);

  if (queryError) throw error(500, queryError.message);
  return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const weekKey = typeof body?.weekKey === 'string' ? body.weekKey : '';
  const day = typeof body?.day === 'string' ? body.day : '';
  const content = typeof body?.content === 'string' ? body.content : '';

  if (!weekKey || !day) {
    throw error(400, 'weekKey and day are required');
  }

  const { error: upsertError } = await supabaseAdmin.from('weekly_plan').upsert(
    {
      week_key: weekKey,
      day,
      content
    },
    { onConflict: 'week_key,day' }
  );

  if (upsertError) throw error(500, upsertError.message);

  return json({ success: true });
};
