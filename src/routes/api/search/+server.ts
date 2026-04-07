import { json } from '@sveltejs/kit';
import { searchPlannerData } from '$lib/server/planner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  return json(await searchPlannerData(url.searchParams.get('q') ?? ''));
};
