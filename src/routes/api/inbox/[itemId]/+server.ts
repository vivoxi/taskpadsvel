import { error, json } from '@sveltejs/kit';
import { updateInboxItem } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const itemId = params.itemId;
  if (!itemId) throw error(400, 'Inbox item id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const item = await updateInboxItem(itemId, {
    title: typeof body?.title === 'string' ? body.title : undefined,
    notes: typeof body?.notes === 'string' ? body.notes : undefined,
    priority:
      body?.priority === 'high' || body?.priority === 'medium' || body?.priority === 'low'
        ? body.priority
        : undefined,
    due_date: typeof body?.due_date === 'string' || body?.due_date === null ? (body.due_date as string | null) : undefined,
    hours_needed: typeof body?.hours_needed === 'number' || body?.hours_needed === null ? (body.hours_needed as number | null) : undefined,
    category: typeof body?.category === 'string' || body?.category === null ? (body.category as string | null) : undefined,
    archived_at:
      typeof body?.archived_at === 'string' || body?.archived_at === null
        ? (body.archived_at as string | null)
        : undefined
  });

  return json(item);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const itemId = params.itemId;
  if (!itemId) throw error(400, 'Inbox item id is required');

  const item = await updateInboxItem(itemId, {
    archived_at: new Date().toISOString()
  });

  return json(item);
};
