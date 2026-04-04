import { describe, expect, it } from 'vitest';
import {
  cloneTemplateSourceItems,
  cloneTemplateSourceItemsByWeek
} from '../src/lib/periodTemplateSources';
import type { PersistedPeriodTaskInstance } from '../src/lib/periodInstances';

function makeInstance(overrides: Partial<PersistedPeriodTaskInstance> = {}): PersistedPeriodTaskInstance {
  return {
    id: 'weekly-source:1:t1',
    template_id: 't1',
    title: 'Haftalik gorev',
    type: 'weekly',
    completed: false,
    notes: '',
    scheduling_notes: '',
    created_at: '2026-04-04T00:00:00.000Z',
    period_key: '2026-M04-W1',
    period_type: 'weekly',
    instance_key: 'weekly-source:1:t1',
    estimated_hours: 1,
    preferred_week_of_month: 1,
    preferred_day: 'Monday',
    category: null,
    carryover: false,
    carryover_source_period_key: null,
    ...overrides
  };
}

describe('periodTemplateSources helpers', () => {
  it('clones template source arrays without sharing object references', () => {
    const sourceItems = [makeInstance()];

    const clonedItems = cloneTemplateSourceItems(sourceItems);

    expect(clonedItems).toEqual(sourceItems);
    expect(clonedItems).not.toBe(sourceItems);
    expect(clonedItems[0]).not.toBe(sourceItems[0]);
  });

  it('clones weekly source maps without sharing nested arrays', () => {
    const byWeek = {
      1: [makeInstance()],
      2: [makeInstance({ id: 'weekly-source:2:t2', template_id: 't2', instance_key: 'weekly-source:2:t2' })]
    };

    const clonedByWeek = cloneTemplateSourceItemsByWeek(byWeek);
    clonedByWeek[1]?.pop();

    expect(clonedByWeek).toEqual({
      1: [],
      2: [byWeek[2][0]]
    });
    expect(byWeek[1]).toHaveLength(1);
    expect(clonedByWeek[2]).not.toBe(byWeek[2]);
    expect(clonedByWeek[2]?.[0]).not.toBe(byWeek[2][0]);
  });
});
