import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey } from '$lib/planner/dates';
import type { TasksByDay } from '$lib/planner/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);
  const byDay: TasksByDay = {};

  for (const instance of view.tasks) {
    if (!instance.day_name) continue;
    const dayTasks = byDay[instance.day_name] ?? [];
    dayTasks.push(instance);
    byDay[instance.day_name] = dayTasks;
  }

  return {
    view,
    byDay
  };
};
