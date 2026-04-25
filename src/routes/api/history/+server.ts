import { json } from '@sveltejs/kit';
import { getHistoryViewData } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  return json(await getHistoryViewData());
};
