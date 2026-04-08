import { getHistoryViewData } from '$lib/server/planner';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
  view: await getHistoryViewData()
});
