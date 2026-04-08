import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName } from '$lib/planner/types';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const blockId = params.blockId;
  if (!blockId) throw error(400, 'Block id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: Record<string, unknown> = {};

  if (typeof body?.locked === 'boolean') updates.locked = body.locked;
  if (typeof body?.status === 'string' && ['planned', 'done', 'skipped'].includes(body.status)) {
    updates.status = body.status;
  }
  if (typeof body?.scheduled_for === 'string') updates.scheduled_for = body.scheduled_for;
  if (typeof body?.starts_at === 'string') updates.starts_at = body.starts_at;
  if (typeof body?.ends_at === 'string') updates.ends_at = body.ends_at;
  if (typeof body?.task_instance_id === 'string' || body?.task_instance_id === null) {
    updates.task_instance_id = body.task_instance_id;
  }
  if (typeof body?.day_name === 'string' && DAY_NAMES.includes(body.day_name as DayName)) {
    updates.day_name = body.day_name;
  }
  if (body?.day_name === null) {
    updates.day_name = null;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error: updateError } = await supabaseAdmin
    .from('schedule_blocks')
    .update(updates)
    .eq('id', blockId)
    .select('*')
    .single();

  if (updateError) throw error(500, updateError.message);

  return json(data);
};
