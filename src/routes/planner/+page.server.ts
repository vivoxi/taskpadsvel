import { getMonthViewData } from '$lib/server/planner';
import { normalizeMonthKey } from '$lib/planner/dates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const monthKey = normalizeMonthKey(url.searchParams.get('month'));
  return {
    view: await getMonthViewData(monthKey)
  };
};
