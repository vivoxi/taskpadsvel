import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName, type TaskPriority, type TaskSourceType } from '$lib/planner/types';
import { syncTemplateHoursDefault, syncTemplatePlanningDefaults, syncTemplateSnapshot } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import { parseNullableHours } from '$lib/server/planner/validation';
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

function parsePriority(value: unknown): TaskPriority | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function parseSourceType(value: unknown): TaskSourceType | null {
  return value === 'weekly' || value === 'monthly' || value === 'inbox' ? value : null;
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
      hours_needed_default: null,
      priority_default: 'medium',
      category: null,
      source_type_default: kind,
      due_day_offset: null,
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

  const { data: currentTemplate, error: currentTemplateError } = await supabaseAdmin
    .from('task_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (currentTemplateError || !currentTemplate) {
    throw error(404, 'Template not found');
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') updates.title = body.title.trim();
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.estimate_hours === 'number' || body.estimate_hours === null) {
    updates.estimate_hours = parseNullableHours(body.estimate_hours, 'estimate_hours');
  }
  if (typeof body.hours_needed_default === 'number' || body.hours_needed_default === null) {
    updates.hours_needed_default = parseNullableHours(body.hours_needed_default, 'hours_needed_default');
  }
  if ('priority_default' in body) {
    const priority = parsePriority(body.priority_default);
    if (!priority) throw error(400, 'Invalid priority_default');
    updates.priority_default = priority;
  }
  if ('category' in body) {
    updates.category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
  }
  if ('source_type_default' in body) {
    const sourceType = parseSourceType(body.source_type_default);
    if (!sourceType) throw error(400, 'Invalid source_type_default');
    updates.source_type_default = sourceType;
  }
  if (typeof body.due_day_offset === 'number' || body.due_day_offset === null) {
    updates.due_day_offset = body.due_day_offset;
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

  if ('hours_needed_default' in updates) {
    await syncTemplateHoursDefault(id, updates.hours_needed_default as number | null);
  }

  if ('preferred_day' in updates || 'preferred_week_of_month' in updates) {
    await syncTemplatePlanningDefaults({
      templateId: id,
      previousPreferredDay: parseDayName(currentTemplate.preferred_day),
      nextPreferredDay:
        'preferred_day' in updates ? parseDayName(updates.preferred_day) : parseDayName(currentTemplate.preferred_day),
      previousPreferredWeekOfMonth:
        typeof currentTemplate.preferred_week_of_month === 'number'
          ? currentTemplate.preferred_week_of_month
          : null,
      nextPreferredWeekOfMonth:
        typeof updates.preferred_week_of_month === 'number'
          ? updates.preferred_week_of_month
          : updates.preferred_week_of_month === null
            ? null
            : typeof currentTemplate.preferred_week_of_month === 'number'
              ? currentTemplate.preferred_week_of_month
              : null
    });
  }

  return json({ success: true });
};
