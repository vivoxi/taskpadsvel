import { error, json } from '@sveltejs/kit';
import { promoteInboxItem } from '$lib/server/planner';
import { DAY_NAMES, type DayName } from '$lib/planner/types';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const itemId = params.itemId;
  if (!itemId) throw error(400, 'Inbox item id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  if (kind !== 'weekly' && kind !== 'monthly') {
    throw error(400, 'kind must be weekly or monthly');
  }

  const promoted = await promoteInboxItem({
    inboxItemId: itemId,
    kind,
    monthKey: typeof body?.monthKey === 'string' ? body.monthKey : '',
    weekKey: typeof body?.weekKey === 'string' ? body.weekKey : null,
    dayName:
      typeof body?.dayName === 'string' && DAY_NAMES.includes(body.dayName as DayName)
        ? (body.dayName as DayName)
        : null
  });

  return json(promoted);
};
