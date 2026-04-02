import { describe, expect, it } from 'vitest';
import { generateRuleBasedSchedule } from '../src/lib/server/ruleScheduler';
import { serializeTaskDetails } from '../src/lib/taskDetails';

describe('ruleScheduler', () => {
  it('prefers explicit planner note slots when task title matches', () => {
    const blocks = generateRuleBasedSchedule({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 1,
      plannerNotes: {
        Monday: '10:00-12:00 Bank reconciliation'
      },
      weeklyTasks: [
        {
          id: 'w1',
          title: 'Bank reconciliation',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('', 2, null, 'Monday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      monthlyTasks: []
    });

    expect(blocks[0]).toMatchObject({
      day: 'Monday',
      start_time: '10:00',
      end_time: '12:00',
      task_title: 'Bank reconciliation',
      linked_task_id: 'w1'
    });
  });

  it('schedules only matching monthly tasks for the selected week of month', () => {
    const blocks = generateRuleBasedSchedule({
      weekKey: '2026-W15',
      monthKey: '2026-M04',
      weekOfMonth: 2,
      plannerNotes: {},
      weeklyTasks: [],
      monthlyTasks: [
        {
          id: 'm1',
          title: 'Week 1 monthly',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 2, 1, 'Thursday'),
          created_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'm2',
          title: 'Week 2 monthly',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 2, 2, 'Friday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    });

    expect(blocks.some((block) => block.task_title === 'Week 1 monthly')).toBe(false);
    expect(blocks.some((block) => block.task_title === 'Week 2 monthly')).toBe(true);
  });

  it('keeps generated rule-based blocks inside 10-13 and 14-17 work windows', () => {
    const blocks = generateRuleBasedSchedule({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 1,
      plannerNotes: {},
      weeklyTasks: [
        {
          id: 'w1',
          title: 'Long weekly task',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('', 5, null, 'Monday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      monthlyTasks: []
    });

    expect(
      blocks.every(
        (block) =>
          (block.start_time >= '10:00' && block.end_time <= '13:00') ||
          (block.start_time >= '14:00' && block.end_time <= '17:00')
      )
    ).toBe(true);
    expect(blocks.every((block) => typeof block.linked_instance_key === 'string')).toBe(true);
  });

  it('prioritizes carry-over tasks earlier when scheduling without planner notes', () => {
    const blocks = generateRuleBasedSchedule({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 1,
      plannerNotes: {},
      carryoverTaskTitles: ['Carry over first'],
      weeklyTasks: [
        {
          id: 'w1',
          title: 'Carry over first',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('', 2),
          created_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'w2',
          title: 'Normal task',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('', 2),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      monthlyTasks: []
    });

    expect(blocks[0]?.task_title).toBe('Carry over first');
  });
});
