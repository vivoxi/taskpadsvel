import { json } from '@sveltejs/kit';
import { createInboxItem } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const item = await createInboxItem({
    title: typeof body?.title === 'string' ? body.title : '',
    notes: typeof body?.notes === 'string' ? body.notes : null,
    priority:
      body?.priority === 'high' || body?.priority === 'low' || body?.priority === 'medium'
        ? body.priority
        : undefined,
    due_date: typeof body?.due_date === 'string' ? body.due_date : null,
    hours_needed: typeof body?.hours_needed === 'number' ? body.hours_needed : null,
    category: typeof body?.category === 'string' ? body.category : null
  });

  return json(item);
};
