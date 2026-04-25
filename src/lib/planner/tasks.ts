import type { DayName, TaskInstance, TasksByDay } from '$lib/planner/types';

export function mergeIntoDayBuckets(
  byDay: TasksByDay,
  instances: TaskInstance[],
  seenTaskIds = new Set<string>(),
  getDayName: (task: TaskInstance) => DayName | null | undefined = (task) => task.day_name
): void {
  for (const task of instances) {
    const dayName = getDayName(task);
    if (!dayName || seenTaskIds.has(task.id)) continue;

    const bucket = byDay[dayName] ?? [];
    bucket.push(task);
    byDay[dayName] = bucket;
    seenTaskIds.add(task.id);
  }
}
