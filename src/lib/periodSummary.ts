import { parseTaskDetails } from './taskDetails';
import type { PersistedPeriodTaskInstance } from './periodInstances';
import type { HistorySnapshot, Task } from './types';

export type TaskProgressSummary = {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  plannedHours: number;
  completedHours: number;
  openHours: number;
  completionPercentage: number;
};

function getTaskEstimatedHours(task: Task): number {
  return parseTaskDetails(task.notes).estimatedHours ?? 1;
}

function roundHours(value: number): number {
  return Number(value.toFixed(1));
}

export function summarizeTasks(tasks: Task[]): TaskProgressSummary {
  const completedTasks = tasks.filter((task) => task.completed);
  const openTasks = tasks.filter((task) => !task.completed);
  const plannedHours = tasks.reduce((sum, task) => sum + getTaskEstimatedHours(task), 0);
  const completedHours = completedTasks.reduce((sum, task) => sum + getTaskEstimatedHours(task), 0);

  return {
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    openTasks: openTasks.length,
    plannedHours: roundHours(plannedHours),
    completedHours: roundHours(completedHours),
    openHours: roundHours(Math.max(0, plannedHours - completedHours)),
    completionPercentage: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0
  };
}

export function summarizeSnapshot(snapshot: HistorySnapshot | null | undefined): TaskProgressSummary {
  const tasks = [
    ...((snapshot?.completed_tasks ?? []) as Task[]),
    ...((snapshot?.missed_tasks ?? []) as Task[])
  ];
  return summarizeTasks(tasks);
}

export function summarizeInstances(
  instances: PersistedPeriodTaskInstance[],
  completedInstanceKeys: string[]
): TaskProgressSummary {
  const completedSet = new Set(completedInstanceKeys);
  const totalTasks = instances.length;
  const completedTasks = instances.filter((instance) => completedSet.has(instance.instance_key));
  const plannedHours = instances.reduce((sum, instance) => sum + (instance.estimated_hours ?? 1), 0);
  const completedHours = completedTasks.reduce(
    (sum, instance) => sum + (instance.estimated_hours ?? 1),
    0
  );

  return {
    totalTasks,
    completedTasks: completedTasks.length,
    openTasks: totalTasks - completedTasks.length,
    plannedHours: roundHours(plannedHours),
    completedHours: roundHours(completedHours),
    openHours: roundHours(Math.max(0, plannedHours - completedHours)),
    completionPercentage: totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0
  };
}
