import { error, json } from '@sveltejs/kit';
import { DAY_NAMES, type DayName, type TaskInstanceStatus } from '$lib/planner/types';
import { inferWeekIndex } from '$lib/server/planner';
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

function parseStatus(value: unknown): TaskInstanceStatus | null {
  return value === 'open' || value === 'done' ? value : null;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const instanceId = params.instanceId;
  if (!instanceId) throw error(400, 'Instance id is required');

  const body = parseBody(await request.json().catch(() => null));
  const updates: Record<string, unknown> = {};

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
    updates.week_key = typeof body.week_key === 'string' && body.week_key ? body.week_key : null;
  }

  if ('month_key' in body && (typeof body.month_key === 'string' || body.month_key === null)) {
    updates.month_key = body.month_key;
  }

  const monthKey =
    (typeof body.month_key === 'string' ? body.month_key : null) ??
    (typeof body.existing_month_key === 'string' ? body.existing_month_key : null);
  const weekKey =
    (typeof updates.week_key === 'string' ? updates.week_key : null) ??
    (typeof body.existing_week_key === 'string' ? body.existing_week_key : null);

  if ('week_key' in updates || 'month_key' in updates) {
    updates.week_of_month = inferWeekIndex(weekKey, monthKey);
  }

  if (Object.keys(updates).length === 0) {
    throw error(400, 'No valid updates supplied');
  }

  const { error: updateError } = await supabaseAdmin.from('task_instances').update(updates).eq('id', instanceId);
  if (updateError) throw error(500, updateError.message);

  return json({ success: true });
};
