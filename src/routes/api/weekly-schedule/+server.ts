import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const weekKey = url.searchParams.get('weekKey')?.trim();
  const weekKeys = url.searchParams
    .get('weekKeys')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  let query = supabaseAdmin.from('weekly_schedule').select('*');

  if (weekKey) {
    query = query.eq('week_key', weekKey);
  } else if (weekKeys.length > 0) {
    query = query.in('week_key', weekKeys);
  } else {
    throw error(400, 'weekKey or weekKeys is required');
  }

  const { data, error: queryError } = await query.order('sort_order', { ascending: true });
  if (queryError) throw error(500, queryError.message);

  return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const weekKey = typeof body?.week_key === 'string' ? body.week_key : '';
  const day = typeof body?.day === 'string' ? body.day : '';
  const startTime = typeof body?.start_time === 'string' ? body.start_time : '';
  const endTime = typeof body?.end_time === 'string' ? body.end_time : '';
  const taskTitle = typeof body?.task_title === 'string' ? body.task_title : '';
  const notes = typeof body?.notes === 'string' ? body.notes : '';
  const sortOrder =
    typeof body?.sort_order === 'number' && Number.isInteger(body.sort_order)
      ? body.sort_order
      : 0;

  if (!weekKey || !day || !startTime || !endTime || !taskTitle) {
    throw error(400, 'week_key, day, start_time, end_time, and task_title are required');
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('weekly_schedule')
    .insert({
      week_key: weekKey,
      day,
      start_time: startTime,
      end_time: endTime,
      task_title: taskTitle,
      notes,
      sort_order: sortOrder
    })
    .select()
    .single();

  if (insertError) throw error(500, insertError.message);

  return json(data);
};
