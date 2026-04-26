import type { ScheduleBlock } from '$lib/planner/types';
export {
  generateScheduleForMonth,
  listScheduleBlocksForMonth,
  resetScheduleForMonth,
  saveWeeklyDayBlocks
} from './legacy';

export function summarizeScheduleReset(blocks: ScheduleBlock[]): {
  removedBlocks: number;
  lockedBlocksKept: number;
} {
  return {
    removedBlocks: blocks.filter((block) => !block.locked).length,
    lockedBlocksKept: blocks.filter((block) => block.locked).length
  };
}
