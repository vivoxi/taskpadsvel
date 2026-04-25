import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { searchPlannerData } from '$lib/server/planner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  return json(await searchPlannerData(url.searchParams.get('q') ?? ''));
};
