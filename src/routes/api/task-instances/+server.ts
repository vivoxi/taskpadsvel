import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName } from '$lib/planner/types';
import { inferWeekIndex, normalizeTask } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';

export const POST = async ({ request }: RequestEvent) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw error(400, 'Body must be an object');
  }

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  if (!title) throw error(400, 'title is required');

  const monthKey = typeof body.month_key === 'string' ? body.month_key : null;
  if (!monthKey) throw error(400, 'month_key is required');

  const weekKey = typeof body.week_key === 'string' && body.week_key ? body.week_key : null;
  const dayName: DayName | null =
    typeof body.day_name === 'string' && DAY_NAMES.includes(body.day_name as DayName)
      ? (body.day_name as DayName)
      : null;

  const now = new Date().toISOString();
  const weekOfMonth = inferWeekIndex(weekKey, monthKey);

  const { data, error: insertError } = await supabaseAdmin
    .from('task_instances')
    .insert({
      id: crypto.randomUUID(),
      template_id: null,
      title_snapshot: title,
      instance_kind: 'weekly',
      month_key: monthKey,
      week_key: weekKey,
      week_of_month: weekOfMonth,
      day_name: dayName,
      status: 'open',
      completed_at: null,
      priority: 'medium',
      due_date: null,
      hours_needed: null,
      category: null,
      source_type: 'inbox',
      preferred_day: dayName,
      preferred_week: weekOfMonth,
      carried_from_instance_id: null,
      archived_at: null,
      archive_reason: null,
      linked_schedule_block_id: null,
      sort_order: null,
      source_context: typeof body.source_context === 'object' ? body.source_context : null,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  return json({ instance: normalizeTask(data) });
};
