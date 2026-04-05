import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName } from '$lib/planner/types';
import { syncTemplateSnapshot } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

function parseBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw error(400, 'Body must be an object');
  }

  return value as Record<string, unknown>;
}

function parseDayName(value: unknown): DayName | null {
  return typeof value === 'string' && DAY_NAMES.includes(value as DayName)
    ? (value as DayName)
    : null;
}

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = parseBody(await request.json().catch(() => null));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const kind = body.kind;

  if (!title) throw error(400, 'Title is required');
  if (kind !== 'weekly' && kind !== 'monthly') {
    throw error(400, 'kind must be weekly or monthly');
  }

  const { data: sortRows, error: sortError } = await supabaseAdmin
    .from('task_templates')
    .select('sort_order')
    .eq('kind', kind)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1);

  if (sortError) throw error(500, sortError.message);

  const nextSort = ((sortRows?.[0]?.sort_order as number | null | undefined) ?? 0) + 1;

  const { data, error: insertError } = await supabaseAdmin
    .from('task_templates')
    .insert({
      title,
      kind,
      active: true,
      estimate_hours: null,
      preferred_day: null,
      preferred_week_of_month: null,
      sort_order: nextSort
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  return json(data);
};

export const PATCH: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = parseBody(await request.json().catch(() => null));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) throw error(400, 'Template id is required');

  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') updates.title = body.title.trim();
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.estimate_hours === 'number' || body.estimate_hours === null) {
    updates.estimate_hours = body.estimate_hours;
  }
  if ('preferred_day' in body) updates.preferred_day = parseDayName(body.preferred_day);
  if (
    typeof body.preferred_week_of_month === 'number' ||
    body.preferred_week_of_month === null
  ) {
    updates.preferred_week_of_month = body.preferred_week_of_month;
  }
  if (typeof body.sort_order === 'number' || body.sort_order === null) {
    updates.sort_order = body.sort_order;
  }

  if (Object.keys(updates).length === 0) {
    throw error(400, 'No valid updates supplied');
  }

  const { error: updateError } = await supabaseAdmin.from('task_templates').update(updates).eq('id', id);
  if (updateError) throw error(500, updateError.message);

  if (typeof updates.title === 'string' && updates.title) {
    await syncTemplateSnapshot(id, updates.title);
  }

  return json({ success: true });
};
