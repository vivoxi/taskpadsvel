import { toSchedulableTask, type SchedulableTask } from './taskDetails';
import type { Task } from './types';

export interface MaterializedTaskInstance extends SchedulableTask {
  template_id: string;
  period_key: string;
  period_type: 'weekly' | 'monthly';
  instance_key: string;
}

function buildInstanceKey(task: Task, periodKey: string): string {
  return `${task.type}:${task.id}:${periodKey}`;
}

function materializeTask(task: Task, periodKey: string): MaterializedTaskInstance {
  const normalized = toSchedulableTask(task);
  const periodType = task.type === 'monthly' ? 'monthly' : 'weekly';

  return {
    ...normalized,
    template_id: task.id,
    period_key: periodKey,
    period_type: periodType,
    instance_key: buildInstanceKey(task, periodKey)
  };
}

export function materializeWeeklyTaskInstances(
  tasks: Task[],
  weekKey: string
): MaterializedTaskInstance[] {
  return tasks.filter((task) => task.type === 'weekly').map((task) => materializeTask(task, weekKey));
}

export function materializeMonthlyTaskInstances(
  tasks: Task[],
  monthKey: string
): MaterializedTaskInstance[] {
  return tasks
    .filter((task) => task.type === 'monthly')
    .map((task) => materializeTask(task, monthKey));
}

export function filterMonthlyInstancesForWeek(
  instances: MaterializedTaskInstance[],
  weekOfMonth: number
): MaterializedTaskInstance[] {
  return instances.filter(
    (task) => task.preferred_week_of_month === null || task.preferred_week_of_month === weekOfMonth
  );
}

export function materializeTasksForWeek(input: {
  weekKey: string;
  monthKey: string;
  weekOfMonth: number;
  weeklyTasks: Task[];
  monthlyTasks: Task[];
}): {
  weeklyInstances: MaterializedTaskInstance[];
  monthlyInstances: MaterializedTaskInstance[];
  selectedMonthlyInstances: MaterializedTaskInstance[];
  allInstances: MaterializedTaskInstance[];
} {
  const weeklyInstances = materializeWeeklyTaskInstances(input.weeklyTasks, input.weekKey);
  const monthlyInstances = materializeMonthlyTaskInstances(input.monthlyTasks, input.monthKey);
  const selectedMonthlyInstances = filterMonthlyInstancesForWeek(
    monthlyInstances,
    input.weekOfMonth
  );

  return {
    weeklyInstances,
    monthlyInstances,
    selectedMonthlyInstances,
    allInstances: [...weeklyInstances, ...selectedMonthlyInstances]
  };
}
