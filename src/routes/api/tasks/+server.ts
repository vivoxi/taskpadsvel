import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { TaskType } from '$lib/types';
import type { RequestHandler } from './$types';

const ALLOWED_UPDATE_FIELDS = ['title', 'completed', 'notes'] as const;

function parseBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw error(400, 'Body must be an object');
  }

  return value as Record<string, unknown>;
}

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = parseBody(await request.json().catch(() => null));
  const title = typeof body.title === 'string' ? body.title : '';
  const type = body.type;
  const completed = body.completed === true;
  const notes = typeof body.notes === 'string' ? body.notes : '';

  if (type !== 'weekly' && type !== 'monthly' && type !== 'random') {
    throw error(400, 'Valid task type is required');
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('tasks')
    .insert({
      title,
      type,
      completed,
      notes
    })
    .select()
    .single();

  if (insertError) throw error(500, insertError.message);

  return json(data);
};

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const type = url.searchParams.get('type')?.trim();
  const ids = url.searchParams
    .get('ids')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  let query = supabaseAdmin.from('tasks').select('*');

  if (type === 'weekly' || type === 'monthly' || type === 'random') {
    query = query.eq('type', type);
  }

  if (ids.length > 0) {
    query = query.in('id', ids);
  }

  query = query.order('created_at', { ascending: true });

  const { data, error: queryError } = await query;
  if (queryError) throw error(500, queryError.message);

  return json(data ?? []);
};

export const PATCH: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = parseBody(await request.json().catch(() => null));
  const taskIds = Array.isArray(body.taskIds)
    ? body.taskIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const taskType = body.taskType;
  const updatesSource =
    body.updates && typeof body.updates === 'object' && !Array.isArray(body.updates)
      ? (body.updates as Record<string, unknown>)
      : null;

  if (!updatesSource) {
    throw error(400, 'updates are required');
  }

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in updatesSource) {
      updates[field] = updatesSource[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw error(400, 'No valid fields to update');
  }

  let query = supabaseAdmin.from('tasks').update(updates);

  if (taskIds.length > 0) {
    query = query.in('id', taskIds);
  } else if (taskType === 'weekly' || taskType === 'monthly' || taskType === 'random') {
    query = query.eq('type', taskType as TaskType);
  } else {
    throw error(400, 'taskIds or taskType is required');
  }

  const { error: updateError } = await query;
  if (updateError) throw error(500, updateError.message);

  return json({ success: true });
};
