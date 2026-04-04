import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const ALLOWED_FIELDS = ['day', 'start_time', 'end_time', 'task_title', 'notes', 'sort_order'] as const;

export const PATCH: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw error(400, 'Body must be an object');
  }

  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 0) {
    throw error(400, 'No valid fields to update');
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('weekly_schedule')
    .update(update)
    .eq('id', params.blockId)
    .select()
    .single();

  if (updateError) throw error(500, updateError.message);

  return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { error: deleteError } = await supabaseAdmin
    .from('weekly_schedule')
    .delete()
    .eq('id', params.blockId);

  if (deleteError) throw error(500, deleteError.message);

  return json({ success: true });
};
