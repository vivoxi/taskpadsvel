import { describe, expect, it } from 'vitest';
import { summarizeInstances, summarizeSnapshot, summarizeTasks } from '../src/lib/periodSummary';
import { serializeTaskDetails } from '../src/lib/taskDetails';

describe('periodSummary helpers', () => {
  it('summarizes current task loads using estimated hours', () => {
    const summary = summarizeTasks([
      {
        id: 'w1',
        title: 'Bank',
        type: 'weekly',
        completed: true,
        notes: serializeTaskDetails('', 4),
        created_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'w2',
        title: 'Inventory',
        type: 'weekly',
        completed: false,
        notes: serializeTaskDetails('', 2),
        created_at: '2026-01-01T00:00:00.000Z'
      }
    ]);

    expect(summary).toEqual({
      totalTasks: 2,
      completedTasks: 1,
      openTasks: 1,
      plannedHours: 6,
      completedHours: 4,
      openHours: 2,
      completionPercentage: 50
    });
  });

  it('summarizes archived snapshots from completed and missed task arrays', () => {
    const summary = summarizeSnapshot({
      id: 's1',
      period_type: 'monthly',
      period_key: '2026-M04',
      period_label: 'April 2026',
      completed_tasks: [
        {
          id: 'm1',
          title: 'Tax',
          type: 'monthly',
          completed: true,
          notes: serializeTaskDetails('', 3),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      missed_tasks: [
        {
          id: 'm2',
          title: 'Closing',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 5),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      completed_schedule_blocks: [],
      missed_schedule_blocks: [],
      planner_notes: {},
      completion_rate: 0.5,
      created_at: '2026-04-30T10:00:00.000Z'
    });

    expect(summary.plannedHours).toBe(8);
    expect(summary.completedHours).toBe(3);
    expect(summary.openHours).toBe(5);
    expect(summary.completionPercentage).toBe(50);
  });

  it('summarizes persisted instances using completed instance keys', () => {
    const summary = summarizeInstances(
      [
        {
          id: 'w1',
          title: 'Bank',
          type: 'weekly',
          completed: false,
          notes: '',
          created_at: '2026-01-01T00:00:00.000Z',
          scheduling_notes: '',
          estimated_hours: 4,
          preferred_week_of_month: null,
          preferred_day: null,
          category: null,
          template_id: 'w1',
          period_key: '2026-W14',
          period_type: 'weekly',
          instance_key: 'weekly:w1:2026-W14',
          carryover: false,
          carryover_source_period_key: null
        },
        {
          id: 'w2',
          title: 'Inventory',
          type: 'weekly',
          completed: false,
          notes: '',
          created_at: '2026-01-01T00:00:00.000Z',
          scheduling_notes: '',
          estimated_hours: 2,
          preferred_week_of_month: null,
          preferred_day: null,
          category: null,
          template_id: 'w2',
          period_key: '2026-W14',
          period_type: 'weekly',
          instance_key: 'weekly:w2:2026-W14',
          carryover: true,
          carryover_source_period_key: '2026-W13'
        }
      ],
      ['weekly:w1:2026-W14']
    );

    expect(summary).toEqual({
      totalTasks: 2,
      completedTasks: 1,
      openTasks: 1,
      plannedHours: 6,
      completedHours: 4,
      openHours: 2,
      completionPercentage: 50
    });
  });
});
