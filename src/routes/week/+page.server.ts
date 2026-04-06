import { error } from '@sveltejs/kit';
import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey, getWeekIndexForMonth } from '$lib/planner/dates';
import { supabaseAdmin } from '$lib/server/supabase';
import type { TaskInstance, TasksByDay } from '$lib/planner/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);
  const monthKey = view.monthKey;
  const weekIndex = getWeekIndexForMonth(weekKey, monthKey);

  const { data: monthlyRows, error: monthlyError } = await supabaseAdmin
    .from('task_instances')
    .select('*')
    .eq('month_key', monthKey)
    .eq('instance_kind', 'monthly')
    .not('day_name', 'is', null);

  if (monthlyError) throw error(500, monthlyError.message);

  const relevantMonthly = (monthlyRows as TaskInstance[]).filter(
    (t) => t.week_of_month === null || t.week_of_month === weekIndex
  );

  const byDay: TasksByDay = {};

  for (const instance of view.tasks) {
    if (!instance.day_name) continue;
    const bucket = byDay[instance.day_name] ?? [];
    bucket.push(instance);
    byDay[instance.day_name] = bucket;
  }

  for (const task of relevantMonthly) {
    if (!task.day_name) continue;
    const bucket = byDay[task.day_name] ?? [];
    bucket.push(task);
    byDay[task.day_name] = bucket;
  }

  return {
    view,
    byDay
  };
};
