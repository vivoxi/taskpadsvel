import { supabase } from './supabase';
import { getWeekKey, getMonthKey, weekLabel, monthLabel } from './weekUtils';

/**
 * Captures a snapshot of tasks (and planner notes for weekly) before resetting.
 * Uses upsert so re-running is safe.
 */
export async function takeSnapshot(type: 'weekly' | 'monthly'): Promise<void> {
  const now = new Date();
  const periodKey = type === 'weekly' ? getWeekKey(now) : getMonthKey(now);
  const periodLabel =
    type === 'weekly' ? weekLabel(periodKey) : monthLabel(periodKey);

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
  if (type === 'weekly') {
    const { data: planRows } = await supabase
      .from('weekly_plan')
      .select('day, content')
      .eq('week_key', periodKey);

    if (planRows) {
      plannerNotes = Object.fromEntries(planRows.map((r) => [r.day, r.content]));
    }
  }

  const { error: upsertError } = await supabase.from('history_snapshots').upsert(
    {
      period_type: type,
      period_key: periodKey,
      period_label: periodLabel,
      completed_tasks: completedTasks,
      missed_tasks: missedTasks,
      planner_notes: plannerNotes,
      completion_rate: completionRate
    },
    { onConflict: 'period_type,period_key' }
  );

  if (upsertError) throw upsertError;
}
