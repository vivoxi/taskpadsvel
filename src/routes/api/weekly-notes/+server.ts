import { error, json } from '@sveltejs/kit';
import { normalizeBlocks } from '$lib/planner/blocks';
import { DAY_NAMES, type DayName } from '$lib/planner/types';
import { saveWeeklyDayBlocks } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

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
  const weekKey = typeof body.weekKey === 'string' ? body.weekKey : '';
  const dayName =
    typeof body.dayName === 'string' && DAY_NAMES.includes(body.dayName as DayName)
      ? (body.dayName as DayName)
      : null;

  if (!weekKey || !dayName) {
    throw error(400, 'weekKey and dayName are required');
  }

  await saveWeeklyDayBlocks(weekKey, dayName, normalizeBlocks(body.blocks));
  return json({ success: true });
};
