import { describe, expect, it } from 'vitest';
import type { TaskInstance } from '../src/lib/planner/types';

// Copy of the function we are about to extract — test drives the shape.
function mergeIntoDayBuckets(
  byDay: Partial<Record<string, TaskInstance[]>>,
  instances: TaskInstance[],
  seenTaskIds = new Set<string>()
): void {
  for (const task of instances) {
    if (!task.day_name) continue;
    if (seenTaskIds.has(task.id)) continue;
    const bucket = byDay[task.day_name] ?? [];
    bucket.push(task);
    byDay[task.day_name] = bucket;
    seenTaskIds.add(task.id);
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
    priority: 'medium',
    due_date: null,
    hours_needed: null,
    category: null,
    source_type: 'monthly',
    preferred_day: null,
    preferred_week: null,
    carried_from_instance_id: null,
    archived_at: null,
    archive_reason: null,
    linked_schedule_block_id: null,
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

  it('skips duplicate task ids when monthly tasks are merged twice', () => {
    const byDay: Partial<Record<string, TaskInstance[]>> = {};
    const seenTaskIds = new Set<string>();
    const task = makeInstance({ id: 'same-task', day_name: 'Monday', week_key: '2026-W15' });

    mergeIntoDayBuckets(byDay, [task], seenTaskIds);
    mergeIntoDayBuckets(byDay, [task], seenTaskIds);

    expect(byDay['Monday']).toEqual([task]);
  });
});
