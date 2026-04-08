import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { normalizeMonthKey } from '$lib/planner/dates';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw error(400, 'Body must be an object');
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  if (!title) throw error(400, 'Title is required');

  const monthKey = typeof body.monthKey === 'string' ? normalizeMonthKey(body.monthKey) : null;
  if (!monthKey) throw error(400, 'monthKey is required');

  const hoursNeeded =
    typeof body.hoursNeeded === 'number' && Number.isFinite(body.hoursNeeded)
      ? body.hoursNeeded
      : null;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const { data, error: insertError } = await supabaseAdmin
    .from('task_instances')
    .insert({
      id,
      template_id: null,
      title_snapshot: title,
      instance_kind: 'weekly',
      week_key: null,
      month_key: monthKey,
      week_of_month: null,
      day_name: null,
      status: 'open',
      completed_at: null,
      priority: 'medium',
      due_date: null,
      hours_needed: hoursNeeded,
      category: null,
      source_type: 'inbox',
      preferred_day: null,
      preferred_week: null,
      carried_from_instance_id: null,
      archived_at: null,
      archive_reason: null,
      linked_schedule_block_id: null,
      sort_order: null,
      source_context: { created_from: 'quick-add', month_key: monthKey },
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  return json({ success: true, instance: data }, { status: 201 });
};
