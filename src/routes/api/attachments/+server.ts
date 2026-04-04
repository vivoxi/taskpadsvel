import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const taskIds = url.searchParams
    .get('taskIds')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const weekKey = url.searchParams.get('weekKey')?.trim() ?? '';

  if (taskIds.length === 0) {
    return json([]);
  }

  let query = supabaseAdmin.from('task_attachments').select('*').in('task_id', taskIds);
  if (weekKey) {
    query = query.eq('week_key', weekKey);
  }

  const { data, error: queryError } = await query;
  if (queryError) throw error(500, queryError.message);

  return json(data ?? []);
};
