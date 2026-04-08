import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey } from '$lib/planner/dates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);

  return {
    view,
    byDay: view.tasksByDay
  };
};
