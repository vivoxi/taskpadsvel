import { supabase } from './supabase';
import { parseScheduleBlockDetails } from './scheduleBlockDetails';
import { getWeekKey, getMonthKey, weekLabel, monthLabel } from './weekUtils';
import type { ScheduleBlock } from './types';

/**
 * Captures a snapshot of tasks (and planner notes for weekly) before resetting.
 * Uses upsert so re-running is safe.
 */
export async function takeSnapshot(
  type: 'weekly' | 'monthly',
  periodKey?: string
): Promise<void> {
  const now = new Date();
  const resolvedPeriodKey =
    periodKey ?? (type === 'weekly' ? getWeekKey(now) : getMonthKey(now));
  const periodLabel =
    type === 'weekly' ? weekLabel(resolvedPeriodKey) : monthLabel(resolvedPeriodKey);

  // Fetch tasks of this type
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('type', type);

  if (tasksError) throw tasksError;
  if (!tasks) return;

  const completedTasks = tasks.filter((t) => t.completed);
  const missedTasks = tasks.filter((t) => !t.completed);
  const completionRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

  // Fetch planner notes (weekly only)
  let plannerNotes: Record<string, string> = {};
  let completedScheduleBlocks: ScheduleBlock[] = [];
  let missedScheduleBlocks: ScheduleBlock[] = [];
  if (type === 'weekly') {
    const { data: planRows } = await supabase
      .from('weekly_plan')
      .select('day, content')
      .eq('week_key', resolvedPeriodKey);

    if (planRows) {
      plannerNotes = Object.fromEntries(planRows.map((r) => [r.day, r.content]));
    }

    const { data: scheduleRows, error: scheduleError } = await supabase
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

  const { error: upsertError } = await supabase.from('history_snapshots').upsert(
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
