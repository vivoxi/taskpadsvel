import { describe, expect, it } from 'vitest';
import { normalizeScheduleDayBlocks } from '../src/lib/scheduleLayout';
import type { ScheduleBlock } from '../src/lib/types';

function makeBlock(
  id: string,
  start_time: string,
  end_time: string,
  sort_order: number
): ScheduleBlock {
  return {
    id,
    week_key: '2026-W14',
    day: 'Monday',
    start_time,
    end_time,
    task_title: `Task ${id}`,
    notes: '',
    sort_order
  };
}

describe('normalizeScheduleDayBlocks', () => {
  it('reassigns times sequentially inside work windows', () => {
    const blocks = normalizeScheduleDayBlocks('Tuesday', [
      makeBlock('a', '14:00', '16:00', 0),
      makeBlock('b', '10:00', '12:00', 1),
      makeBlock('c', '16:00', '17:00', 2)
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        id: 'a',
        day: 'Tuesday',
        sort_order: 0,
        start_time: '10:00',
        end_time: '12:00'
      }),
      expect.objectContaining({
        id: 'b',
        day: 'Tuesday',
        sort_order: 1,
        start_time: '14:00',
        end_time: '16:00'
      }),
      expect.objectContaining({
        id: 'c',
        day: 'Tuesday',
        sort_order: 2,
        start_time: '16:00',
        end_time: '17:00'
      })
    ]);
  });

  it('uses drag order instead of previous sort_order values', () => {
    const blocks = normalizeScheduleDayBlocks('Monday', [
      makeBlock('b', '14:00', '16:00', 1),
      makeBlock('a', '10:00', '12:00', 0)
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        id: 'b',
        sort_order: 0,
        start_time: '10:00',
        end_time: '12:00'
      }),
      expect.objectContaining({
        id: 'a',
        sort_order: 1,
        start_time: '14:00',
        end_time: '16:00'
      })
    ]);
  });

  it('returns null when blocks cannot fit into the day', () => {
    const blocks = normalizeScheduleDayBlocks('Monday', [
      makeBlock('a', '10:00', '13:00', 0),
      makeBlock('b', '14:00', '17:00', 1),
      makeBlock('c', '10:00', '11:00', 2)
    ]);

    expect(blocks).toBeNull();
  });
});
