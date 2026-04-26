import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName, type TaskInstanceStatus, type TaskPriority } from '$lib/planner/types';
import { inferWeekIndex } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import {
  assertMonthKey,
  assertWeekKey,
  parseNullableHours,
  parseNullableIsoDate,
  parseNullableIsoDateTime
} from '$lib/server/planner/validation';
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

function parseStatus(value: unknown): TaskInstanceStatus | null {
  return value === 'open' || value === 'done' ? value : null;
}

function parsePriority(value: unknown): TaskPriority | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  const instanceId = params.instanceId;
  if (!instanceId) throw error(400, 'Instance id is required');

  const body = parseBody(await request.json().catch(() => null));
  const updates: Record<string, unknown> = {};

  if (typeof body.title_snapshot === 'string' && body.title_snapshot.trim()) {
    updates.title_snapshot = body.title_snapshot.trim();
  }

  if ('status' in body) {
    const status = parseStatus(body.status);
    if (!status) throw error(400, 'Invalid status');
    updates.status = status;
    updates.completed_at = status === 'done' ? new Date().toISOString() : null;
  }

  if ('day_name' in body) {
    updates.day_name = parseDayName(body.day_name);
  }

  if ('week_key' in body) {
    updates.week_key =
      body.week_key === null || body.week_key === '' ? null : assertWeekKey(body.week_key, 'week_key');
  }

  if ('month_key' in body && (typeof body.month_key === 'string' || body.month_key === null)) {
    updates.month_key =
      body.month_key === null || body.month_key === '' ? null : assertMonthKey(body.month_key, 'month_key');
  }

  if ('priority' in body) {
    const priority = parsePriority(body.priority);
    if (!priority) throw error(400, 'Invalid priority');
    updates.priority = priority;
  }

  if ('due_date' in body) {
    updates.due_date = parseNullableIsoDate(body.due_date, 'due_date');
  }

  if ('hours_needed' in body) {
    updates.hours_needed = parseNullableHours(body.hours_needed, 'hours_needed');
  }

  if ('category' in body) {
    updates.category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
  }

  if ('preferred_day' in body) {
    updates.preferred_day = parseDayName(body.preferred_day);
  }

  if ('preferred_week' in body) {
    updates.preferred_week =
      typeof body.preferred_week === 'number' && Number.isFinite(body.preferred_week)
        ? body.preferred_week
        : null;
  }

  if ('archive_reason' in body) {
    updates.archive_reason =
      typeof body.archive_reason === 'string' && body.archive_reason.trim()
        ? body.archive_reason.trim()
        : null;
  }

  if ('archived_at' in body) {
    updates.archived_at = parseNullableIsoDateTime(body.archived_at, 'archived_at');
  }

  if ('linked_schedule_block_id' in body) {
    updates.linked_schedule_block_id =
      typeof body.linked_schedule_block_id === 'string' && body.linked_schedule_block_id
        ? body.linked_schedule_block_id
        : null;
  }

  const monthKey =
    ('month_key' in body
      ? (updates.month_key as string | null | undefined) ?? null
      : typeof body.existing_month_key === 'string'
        ? assertMonthKey(body.existing_month_key, 'existing_month_key')
        : null);
  const weekKey =
    ('week_key' in updates
      ? (updates.week_key as string | null | undefined) ?? null
      : typeof body.existing_week_key === 'string'
        ? assertWeekKey(body.existing_week_key, 'existing_week_key')
        : null);

  if ('week_key' in updates || 'month_key' in updates) {
    updates.week_of_month = inferWeekIndex(weekKey, monthKey);
  }

  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).length === 0) {
    throw error(400, 'No valid updates supplied');
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('task_instances')
    .update(updates)
    .eq('id', instanceId)
    .select('*')
    .single();

  if (updateError) throw error(500, updateError.message);

  return json({ success: true, instance: data });
};
