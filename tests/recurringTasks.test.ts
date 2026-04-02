import { describe, expect, it } from 'vitest';
import { materializeTasksForWeek } from '../src/lib/recurringTasks';
import { serializeTaskDetails } from '../src/lib/taskDetails';

describe('recurringTasks helpers', () => {
  it('materializes weekly and monthly templates into period instances', () => {
    const result = materializeTasksForWeek({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 2,
      weeklyTasks: [
        {
          id: 'w1',
          title: 'Weekly bank work',
          type: 'weekly',
          completed: false,
          notes: serializeTaskDetails('Routine', 4, null, 'Monday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ],
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
          notes: serializeTaskDetails('', 3, 2, 'Friday'),
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    });

    expect(result.weeklyInstances).toHaveLength(1);
    expect(result.weeklyInstances[0]).toMatchObject({
      template_id: 'w1',
      period_key: '2026-W14',
      instance_key: 'weekly:w1:2026-W14',
      preferred_day: 'Monday'
    });

    expect(result.monthlyInstances).toHaveLength(2);
    expect(result.selectedMonthlyInstances).toHaveLength(1);
    expect(result.selectedMonthlyInstances[0]).toMatchObject({
      template_id: 'm2',
      period_key: '2026-M04',
      instance_key: 'monthly:m2:2026-M04',
      preferred_week_of_month: 2
    });
  });
});
