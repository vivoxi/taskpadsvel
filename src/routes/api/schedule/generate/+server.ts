import { error, json } from '@sveltejs/kit';
import { generateScheduleForMonth } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const monthKey = typeof body?.monthKey === 'string' ? body.monthKey : '';

  if (!monthKey) throw error(400, 'monthKey is required');

  return json(await generateScheduleForMonth(monthKey));
};
