import type { ScheduleBlock } from './types';

const WORK_WINDOWS = [
  { startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { startMinutes: 14 * 60, endMinutes: 17 * 60 }
];

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getBlockDuration(block: ScheduleBlock): number | null {
  const startMinutes = parseTimeToMinutes(block.start_time);
  const endMinutes = parseTimeToMinutes(block.end_time);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return endMinutes - startMinutes;
}

export function normalizeScheduleDayBlocks(
  day: string,
  blocks: ScheduleBlock[]
): ScheduleBlock[] | null {
  const orderedBlocks = [...blocks];

  const durations = orderedBlocks.map(getBlockDuration);
  if (durations.some((duration) => duration === null)) return null;
  if (durations.some((duration) => (duration ?? 0) > 180)) return null;

  let windowIndex = 0;
  let cursor = WORK_WINDOWS[0]?.startMinutes ?? 0;

  const normalized = orderedBlocks.map((block, index) => {
    const duration = durations[index];
    if (duration === null) {
      return null;
    }

    while (windowIndex < WORK_WINDOWS.length) {
      const window = WORK_WINDOWS[windowIndex];
      if (cursor < window.startMinutes) {
        cursor = window.startMinutes;
      }

      if (cursor + duration <= window.endMinutes) {
        const nextBlock = {
          ...block,
          day,
          sort_order: index,
          start_time: minutesToTime(cursor),
          end_time: minutesToTime(cursor + duration)
        };

        cursor += duration;
        return nextBlock;
      }

      windowIndex += 1;
      cursor = WORK_WINDOWS[windowIndex]?.startMinutes ?? 0;
    }

    return null;
  });

  return normalized.every((block) => block !== null) ? (normalized as ScheduleBlock[]) : null;
}
