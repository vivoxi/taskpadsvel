import { describe, expect, it } from 'vitest';
import {
  createMonthlyPeriodInstances,
  createWeeklyPeriodInstances,
  parsePersistedPeriodInstances
} from '../src/lib/periodInstances';
import { serializeTaskDetails } from '../src/lib/taskDetails';

describe('periodInstances helpers', () => {
  it('creates weekly instances and marks carry-over tasks', () => {
    const instances = createWeeklyPeriodInstances({
      weekKey: '2026-W15',
      weeklyTasks: [
        {
          id: 'w1',
          title: 'Bank',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('', 4),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      previousWeeklySnapshot: {
        id: 's1',
        period_type: 'weekly',
        period_key: '2026-W14',
        period_label: 'Mar 30-Apr 5, 2026',
        completed_tasks: [],
        missed_tasks: [
          {
            id: 'old-w1',
            title: 'Bank',
            type: 'weekly',
            completed: false,
            notes: serializeTaskDetails('', 4),
            created_at: '2026-01-01T00:00:00.000Z'
          }
        ],
        completed_schedule_blocks: [],
        missed_schedule_blocks: [],
        planner_notes: {},
        completion_rate: 0,
        created_at: '2026-04-05T18:00:00.000Z'
      }
    });

    expect(instances[0]).toMatchObject({
      template_id: 'w1',
      period_key: '2026-W15',
      carryover: true,
      carryover_source_period_key: '2026-W14'
    });
  });

  it('parses persisted period instances safely', () => {
    const parsed = parsePersistedPeriodInstances({
      instances: [
        {
          id: 'm1',
          title: 'Month end',
          type: 'monthly',
          completed: false,
          notes: '',
          created_at: '2026-01-01T00:00:00.000Z',
          scheduling_notes: '',
          estimated_hours: 3,
          preferred_week_of_month: 4,
          preferred_day: 'Friday',
          category: null,
          template_id: 'm1',
          period_key: '2026-M04',
          period_type: 'monthly',
          instance_key: 'monthly:m1:2026-M04',
          carryover: false,
          carryover_source_period_key: null
        }
      ],
      updatedAt: '2026-04-02T10:00:00.000Z'
    });

    expect(parsed?.instances[0]?.instance_key).toBe('monthly:m1:2026-M04');
    expect(parsed?.updatedAt).toBe('2026-04-02T10:00:00.000Z');
  });

  it('creates monthly instances and keeps carry-over empty when no snapshot exists', () => {
    const instances = createMonthlyPeriodInstances({
      monthKey: '2026-M04',
      monthlyTasks: [
        {
          id: 'm1',
          title: 'Tax',
          type: 'monthly',
          completed: false,
          notes: serializeTaskDetails('', 3, 1, 'Thursday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    });

    expect(instances[0]?.carryover).toBe(false);
    expect(instances[0]?.instance_key).toBe('monthly:m1:2026-M04');
  });
});
