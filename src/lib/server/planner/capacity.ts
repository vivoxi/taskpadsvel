import type { CapacitySnapshot, ScheduleBlock, ScheduleHealth, SoftAssignment, TaskInstance } from '$lib/planner/types';
export { buildCapacitySnapshot, buildScheduleHealth, buildSoftAssignments } from './legacy';

export function summarizeScheduleHealth(
  tasks: TaskInstance[],
  blocks: ScheduleBlock[],
  capacity: CapacitySnapshot
): ScheduleHealth {
  return {
    block_count: blocks.length,
    locked_count: blocks.filter((block) => block.locked).length,
    split_candidate_count: tasks.filter((task) => (task.hours_needed ?? 0) > 2).length,
    overflow_warning: capacity.overflow_hours > 0 ? `${capacity.overflow_hours.toFixed(1)}h over capacity` : null
  };
}

export function collectSoftAssignedTaskIds(assignments: Partial<Record<string, SoftAssignment>>): string[] {
  return Object.keys(assignments);
}
