import { describe, expect, it } from 'vitest';
import {
  buildWeeklyCellMap,
  moveMonthlyInstance,
  moveWeeklyInstance
} from '../src/lib/monthlySpreadBoard';
import type { PersistedPeriodTaskInstance } from '../src/lib/periodInstances';
import { getMonthWeekKey } from '../src/lib/weekUtils';

function makeInstance(
  overrides: Partial<PersistedPeriodTaskInstance> = {}
): PersistedPeriodTaskInstance {
  return {
    id: 'weekly:t1:2026-M04-W1:1',
    template_id: 't1',
    title: 'Task',
    type: 'weekly',
    completed: false,
    notes: '',
    scheduling_notes: '',
    created_at: '2026-04-04T00:00:00.000Z',
    period_key: '2026-M04-W1',
    period_type: 'weekly',
    instance_key: 'weekly:t1:2026-M04-W1:1',
    estimated_hours: 1,
    preferred_week_of_month: 1,
    preferred_day: 'Monday',
    category: null,
    carryover: false,
    carryover_source_period_key: null,
    ...overrides
  };
}

describe('monthlySpreadBoard helpers', () => {
  it('moves monthly instances by removing and appending the updated copy', () => {
    const first = makeInstance({
      id: 'monthly:t1:2026-M04:1',
      instance_key: 'monthly:t1:2026-M04:1',
      period_key: '2026-M04',
      period_type: 'monthly',
      type: 'monthly',
      preferred_week_of_month: 1
    });
    const second = makeInstance({
      id: 'monthly:t2:2026-M04:2',
      instance_key: 'monthly:t2:2026-M04:2',
      template_id: 't2',
      title: 'Second',
      period_key: '2026-M04',
      period_type: 'monthly',
      type: 'monthly',
      preferred_week_of_month: 2
    });

    const moved = moveMonthlyInstance([first, second], first.instance_key, {
      preferred_week_of_month: 4,
      preferred_day: 'Friday'
    });

    expect(moved).toHaveLength(2);
    expect(moved[1]?.instance_key).toBe(first.instance_key);
    expect(moved[1]?.preferred_week_of_month).toBe(4);
    expect(moved[1]?.preferred_day).toBe('Friday');
  });

  it('moves weekly instances within their week and updates the preferred day', () => {
    const instance = makeInstance();

    const moved = moveWeeklyInstance([instance], instance.instance_key, '2026-M04-W1', 'Thursday');

    expect(moved[0]?.period_key).toBe('2026-M04-W1');
    expect(moved[0]?.preferred_day).toBe('Thursday');
    expect(moved[0]?.id).toBe(instance.instance_key);
  });

  it('builds weekly cells and auto-fills missing days deterministically', () => {
    const monday = makeInstance({ instance_key: 'a', id: 'a', preferred_day: 'Monday' });
    const auto = makeInstance({ instance_key: 'b', id: 'b', preferred_day: null });
    const weekKey = getMonthWeekKey('2026-M04', 1);

    const cells = buildWeeklyCellMap('2026-M04', {
      [weekKey]: [monday, auto]
    });

    expect(cells['1:Monday']).toHaveLength(1);
    expect(cells['1:Tuesday']).toHaveLength(1);
    expect(cells['1:Tuesday']?.[0]?.instance_key).toBe('b');
  });
});
