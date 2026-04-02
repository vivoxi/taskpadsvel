import { describe, expect, it } from 'vitest';
import { buildMonthlyPlanBoard } from '../src/lib/monthlyPlan';
import { serializeTaskDetails } from '../src/lib/taskDetails';

describe('monthlyPlan helpers', () => {
  it('groups monthly tasks into week/day cells and flexible pool', () => {
    const board = buildMonthlyPlanBoard(
      [
        {
          id: 'm1',
          title: 'Abak',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 2, 1, 'Thursday'),
          created_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'm2',
          title: 'Cari mutabakat',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 6, 3, 'Friday'),
          created_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'm3',
          title: 'Flexible task',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 1, null, null),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      '2026-M04'
    );

    expect(
      board.cells.find((cell) => cell.week === 1 && cell.day === 'Thursday')?.tasks[0]?.title
    ).toBe('Abak');
    expect(
      board.cells.find((cell) => cell.week === 3 && cell.day === 'Friday')?.tasks[0]?.title
    ).toBe('Cari mutabakat');
    expect(board.flexibleTasks.map((task) => task.title)).toEqual(['Flexible task']);
  });
});
