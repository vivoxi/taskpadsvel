import {
  getMonthlyInstanceStatusStorageKey,
  getMonthlyInstancesStorageKey,
  getWeeklyInstanceStatusStorageKey,
  getWeeklyInstancesStorageKey,
  parsePersistedPeriodInstanceStatus,
  parsePersistedPeriodInstances
} from './periodInstances';
import { parseScheduleBlockDetails } from './scheduleBlockDetails';
import { getMonthKey, getWeekKey, monthLabel, weekLabel } from './weekUtils';
import type { ScheduleBlock, Task } from './types';

type SnapshotClient = {
  from: (table: string) => any;
};

export async function takeSnapshotWithClient(
  client: SnapshotClient,
  type: 'weekly' | 'monthly',
  periodKey?: string
): Promise<void> {
  const now = new Date();
  const resolvedPeriodKey =
    periodKey ?? (type === 'weekly' ? getWeekKey(now) : getMonthKey(now));
  const periodLabel =
    type === 'weekly' ? weekLabel(resolvedPeriodKey) : monthLabel(resolvedPeriodKey);

  const { data: tasks, error: tasksError } = await client.from('tasks').select('*').eq('type', type);

  if (tasksError) throw tasksError;
  if (!tasks) return;

  let completedTasks = tasks.filter((task: Task) => task.completed);
  let missedTasks = tasks.filter((task: Task) => !task.completed);
  let completionRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

  const instancesStorageKey =
    type === 'weekly'
      ? getWeeklyInstancesStorageKey(resolvedPeriodKey)
      : getMonthlyInstancesStorageKey(resolvedPeriodKey);
  const instanceStatusStorageKey =
    type === 'weekly'
      ? getWeeklyInstanceStatusStorageKey(resolvedPeriodKey)
      : getMonthlyInstanceStatusStorageKey(resolvedPeriodKey);

  const [{ data: persistedInstancesRow }, { data: persistedStatusRow }] = await Promise.all([
    client.from('user_preferences').select('value').eq('key', instancesStorageKey).maybeSingle(),
    client
      .from('user_preferences')
      .select('value')
      .eq('key', instanceStatusStorageKey)
      .maybeSingle()
  ]);

  const persistedInstances = parsePersistedPeriodInstances(persistedInstancesRow?.value);
  const persistedStatus = parsePersistedPeriodInstanceStatus(persistedStatusRow?.value);

  if (persistedInstances?.instances.length) {
    const completedKeys = new Set(persistedStatus?.completedInstanceKeys ?? []);
    const materializedTasks = persistedInstances.instances.map(
      (instance): Task => ({
        id: instance.template_id,
        title: instance.title,
        type: instance.type,
        completed: completedKeys.has(instance.instance_key),
        notes: instance.notes,
        created_at: instance.created_at
      })
    );

    completedTasks = materializedTasks.filter((task) => task.completed);
    missedTasks = materializedTasks.filter((task) => !task.completed);
    completionRate =
      materializedTasks.length > 0 ? completedTasks.length / materializedTasks.length : 0;
  }

  let plannerNotes: Record<string, string> = {};
  let completedScheduleBlocks: ScheduleBlock[] = [];
  let missedScheduleBlocks: ScheduleBlock[] = [];

  if (type === 'weekly') {
    const { data: planRows } = await client
      .from('weekly_plan')
      .select('day, content')
      .eq('week_key', resolvedPeriodKey);

    if (planRows) {
      plannerNotes = Object.fromEntries(planRows.map((row: { day: string; content: string }) => [row.day, row.content]));
    }

    const { data: scheduleRows, error: scheduleError } = await client
      .from('weekly_schedule')
      .select('*')
      .eq('week_key', resolvedPeriodKey)
      .order('sort_order', { ascending: true });

    if (scheduleError) throw scheduleError;

    const scheduleBlocks = (scheduleRows ?? []) as ScheduleBlock[];
    completedScheduleBlocks = scheduleBlocks.filter((block) =>
      parseScheduleBlockDetails(block.notes).completed
    );
    missedScheduleBlocks = scheduleBlocks.filter(
      (block) => !parseScheduleBlockDetails(block.notes).completed
    );
  }

  const { error: upsertError } = await client.from('history_snapshots').upsert(
    {
      period_type: type,
      period_key: resolvedPeriodKey,
      period_label: periodLabel,
      completed_tasks: completedTasks,
      missed_tasks: missedTasks,
      completed_schedule_blocks: completedScheduleBlocks,
      missed_schedule_blocks: missedScheduleBlocks,
      planner_notes: plannerNotes,
      completion_rate: completionRate
    },
    { onConflict: 'period_type,period_key' }
  );

  if (upsertError) throw upsertError;
}
