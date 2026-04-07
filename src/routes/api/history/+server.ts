import { json } from '@sveltejs/kit';
import { getHistoryViewData } from '$lib/server/planner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(await getHistoryViewData());
};
