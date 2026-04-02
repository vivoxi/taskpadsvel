import { json, error } from '@sveltejs/kit';
import { generateRuleBasedSchedule } from '$lib/server/ruleScheduler';
import type { MaterializedTaskInstance } from '$lib/recurringTasks';
import { materializeWeeklyTaskInstances } from '$lib/recurringTasks';
import { serializeScheduleBlockDetails } from '$lib/scheduleBlockDetails';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { getMonthKey, getPreviousMonthKey, getPreviousWeekKey, getWeekDays } from '$lib/weekUtils';
import { getWeeklyInstancesStorageKey } from '$lib/periodInstances';
import type { RequestHandler } from './$types';
import type { HistorySnapshot, Task } from '$lib/types';

type GeneratedBlock = {
  day: string;
  start_time: string;
  end_time: string;
  task_title: string;
  notes: string;
  linked_task_id?: string;
  linked_task_type?: Task['type'];
  linked_instance_key?: string;
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const {
    weekKey,
    weekOfMonth,
    plannerNotes,
    weeklyTasks,
    weeklyInstances,
    monthlyTasks,
    monthlyInstances
  }: {
    weekKey: string;
    weekOfMonth?: number;
    plannerNotes?: Record<string, string>;
    weeklyTasks: Task[];
    weeklyInstances?: MaterializedTaskInstance[];
    monthlyTasks?: Task[];
    monthlyInstances?: MaterializedTaskInstance[];
  } = body;

  if (!weekKey) throw error(400, 'weekKey is required');

  const weekDays = getWeekDays(weekKey);
  const monthKey = getMonthKey(weekDays[2] ?? weekDays[0] ?? new Date());
  const previousWeekKey = getPreviousWeekKey(weekKey);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const [previousWeeklySnapshotResult, previousMonthlySnapshotResult] = await Promise.all([
    supabaseAdmin
      .from('history_snapshots')
      .select('*')
      .eq('period_type', 'weekly')
      .eq('period_key', previousWeekKey)
      .maybeSingle(),
    supabaseAdmin
      .from('history_snapshots')
      .select('*')
      .eq('period_type', 'monthly')
      .eq('period_key', previousMonthKey)
      .maybeSingle()
  ]);

  const previousWeeklySnapshot = previousWeeklySnapshotResult.data as HistorySnapshot | null;
  const previousMonthlySnapshot = previousMonthlySnapshotResult.data as HistorySnapshot | null;
  const weeklyCarryoverTitles = (previousWeeklySnapshot?.missed_tasks ?? [])
    .map((task) => task.title)
    .filter((title): title is string => Boolean(title));
  const monthlyCarryoverTitles = (previousMonthlySnapshot?.missed_tasks ?? [])
    .map((task) => task.title)
    .filter((title): title is string => Boolean(title));
  const carryoverTaskTitles = Array.from(new Set([...weeklyCarryoverTitles, ...monthlyCarryoverTitles]));

  const blocks = generateRuleBasedSchedule({
    weekKey,
    monthKey,
    weekOfMonth,
    plannerNotes,
    weeklyTasks,
    weeklyInstances,
    monthlyTasks,
    monthlyInstances,
    carryoverTaskTitles
  }) satisfies GeneratedBlock[];

  // Replace existing schedule for this week
  const { error: deleteError } = await supabaseAdmin
    .from('weekly_schedule')
    .delete()
    .eq('week_key', weekKey);

  if (deleteError) throw error(500, deleteError.message);

  const toInsert = blocks.map((block, index) => ({
    week_key: weekKey,
    day: block.day,
    start_time: block.start_time,
    end_time: block.end_time,
    task_title: block.task_title,
    sort_order: index,
    notes: serializeScheduleBlockDetails(
      block.notes ?? '',
      false,
      block.linked_task_id ?? null,
      block.linked_task_type ?? null,
      block.linked_instance_key ?? null
    )
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('weekly_schedule')
    .insert(toInsert)
    .select();

  if (insertError) throw error(500, insertError.message);

  const nextWeeklyInstances = (weeklyInstances ?? materializeWeeklyTaskInstances(weeklyTasks, weekKey))
    .map((instance) => ({
      ...instance,
      id: `weekly:${instance.template_id}:${weekKey}`,
      period_key: weekKey,
      instance_key: `weekly:${instance.template_id}:${weekKey}`,
      carryover:
        'carryover' in instance && typeof instance.carryover === 'boolean'
          ? instance.carryover
          : false,
      carryover_source_period_key:
        'carryover_source_period_key' in instance &&
        typeof instance.carryover_source_period_key === 'string'
          ? instance.carryover_source_period_key
          : null
    }));

  const updatedAt = new Date().toISOString();
  const { error: instancesError } = await supabaseAdmin.from('user_preferences').upsert(
    {
      key: getWeeklyInstancesStorageKey(weekKey),
      value: { instances: nextWeeklyInstances, updatedAt },
      updated_at: updatedAt
    },
    { onConflict: 'key' }
  );

  if (instancesError) throw error(500, instancesError.message);

  return json(data);
};
