import { describe, expect, it } from 'vitest';
import type { TaskInstance } from '../src/lib/planner/types';

// Copy of the function we are about to extract — test drives the shape.
function mergeIntoDayBuckets(
  byDay: Partial<Record<string, TaskInstance[]>>,
  instances: TaskInstance[]
): void {
  for (const task of instances) {
    if (!task.day_name) continue;
    const bucket = byDay[task.day_name] ?? [];
    bucket.push(task);
    byDay[task.day_name] = bucket;
  }
}

function makeInstance(overrides: Partial<TaskInstance>): TaskInstance {
  return {
    id: 'i1',
    template_id: 't1',
    title_snapshot: 'Task',
    instance_kind: 'monthly',
    week_key: null,
    month_key: '2026-04',
    week_of_month: null,
    day_name: null,
    status: 'open',
    completed_at: null,
    sort_order: null,
    source_context: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides
  };
}

describe('mergeIntoDayBuckets', () => {
  it('adds a task to the correct day bucket', () => {
    const byDay: Partial<Record<string, TaskInstance[]>> = {};
    const task = makeInstance({ day_name: 'Monday' });
    mergeIntoDayBuckets(byDay, [task]);
    expect(byDay['Monday']).toEqual([task]);
  });

  it('appends to an existing bucket', () => {
    const existing = makeInstance({ id: 'existing', instance_kind: 'weekly', day_name: 'Monday' });
    const byDay: Partial<Record<string, TaskInstance[]>> = { Monday: [existing] };
    const monthly = makeInstance({ id: 'monthly', day_name: 'Monday' });
    mergeIntoDayBuckets(byDay, [monthly]);
    expect(byDay['Monday']).toHaveLength(2);
    expect(byDay['Monday']![1]).toBe(monthly);
  });

  it('skips tasks with no day_name', () => {
    const byDay: Partial<Record<string, TaskInstance[]>> = {};
    mergeIntoDayBuckets(byDay, [makeInstance({ day_name: null })]);
    expect(Object.keys(byDay)).toHaveLength(0);
  });
});
