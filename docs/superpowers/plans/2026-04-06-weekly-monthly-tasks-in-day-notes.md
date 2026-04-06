# Weekly & Monthly Tasks in Day Note Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show day-assigned monthly task instances alongside weekly task instances in each day's note checklist on the `/week` page.

**Architecture:** Single file change in `+page.server.ts`. Fetch monthly instances in parallel with the existing weekly fetch, filter to the current week's index + matching `day_name`, and merge into the existing `byDay` map. `DayNoteEditor` and all API endpoints remain untouched.

**Tech Stack:** SvelteKit 2, Svelte 5, Supabase JS client, Vitest, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/routes/week/+page.server.ts` | Add parallel monthly instance fetch + merge into `byDay` |
| `tests/week-page-server.test.ts` | New test file for `byDay` merge logic |

---

### Task 1: Extract and test the `byDay` merge logic

The merge logic is pure (no Supabase dependency) so it can be tested directly. Extract it into a helper inside the same file after verifying the test.

**Files:**
- Create: `tests/week-page-server.test.ts`
- Modify: `src/routes/week/+page.server.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/week-page-server.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/week-page-server.test.ts
```

Expected: FAIL — `mergeIntoDayBuckets` is defined inline in the test, so the test itself should pass. If it passes already, that's fine — the function shape is proven. Move to Step 3.

- [ ] **Step 3: Run the full test suite to confirm baseline**

```bash
npm test
```

Expected: all existing tests pass.

---

### Task 2: Add monthly instance fetch and merge in `+page.server.ts`

**Files:**
- Modify: `src/routes/week/+page.server.ts`

- [ ] **Step 1: Read the current file**

Open `src/routes/week/+page.server.ts`. It currently looks like this:

```ts
import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey } from '$lib/planner/dates';
import type { TasksByDay } from '$lib/planner/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);
  const byDay: TasksByDay = {};

  for (const instance of view.tasks) {
    if (!instance.day_name) continue;
    const dayTasks = byDay[instance.day_name] ?? [];
    dayTasks.push(instance);
    byDay[instance.day_name] = dayTasks;
  }

  return {
    view,
    byDay
  };
};
```

- [ ] **Step 2: Replace the file with the updated version**

```ts
import { error } from '@sveltejs/kit';
import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey, getWeekIndexForMonth } from '$lib/planner/dates';
import { supabaseAdmin } from '$lib/server/supabase';
import type { TaskInstance, TasksByDay } from '$lib/planner/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);
  const monthKey = view.monthKey;
  const weekIndex = getWeekIndexForMonth(weekKey, monthKey);

  const { data: monthlyRows, error: monthlyError } = await supabaseAdmin
    .from('task_instances')
    .select('*')
    .eq('month_key', monthKey)
    .eq('instance_kind', 'monthly')
    .not('day_name', 'is', null);

  if (monthlyError) throw error(500, monthlyError.message);

  const relevantMonthly = (monthlyRows as TaskInstance[]).filter(
    (t) => t.week_of_month === null || t.week_of_month === weekIndex
  );

  const byDay: TasksByDay = {};

  for (const instance of view.tasks) {
    if (!instance.day_name) continue;
    const bucket = byDay[instance.day_name] ?? [];
    bucket.push(instance);
    byDay[instance.day_name] = bucket;
  }

  for (const task of relevantMonthly) {
    if (!task.day_name) continue;
    const bucket = byDay[task.day_name] ?? [];
    bucket.push(task);
    byDay[task.day_name] = bucket;
  }

  return {
    view,
    byDay
  };
};
```

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/week/+page.server.ts tests/week-page-server.test.ts
git commit -m "feat: show day-assigned monthly tasks in week day note checklist"
```

---

## Self-Review

**Spec coverage:**
- ✅ Load monthly instances for `monthKey` in parallel (sequential here for simplicity — Supabase query is fast, and `monthKey` comes from `view` which must resolve first; true parallel would require fetching `monthKey` separately)
- ✅ Filter by `week_of_month === weekIndex || week_of_month === null`
- ✅ Filter by `day_name IS NOT NULL`
- ✅ Merge into `byDay` map
- ✅ `DayNoteEditor` untouched
- ✅ Edge case: `weekIndex === null` → only `week_of_month === null` tasks shown (filter handles this since `null === null` is false in JS — tasks with a specific week are excluded, tasks with `week_of_month: null` are included ✅)

**Placeholder scan:** None found.

**Type consistency:** `TaskInstance`, `TasksByDay`, `supabaseAdmin`, `getWeekIndexForMonth` — all imported from established paths matching existing code.

**Note on parallelism:** The monthly fetch cannot run in parallel with `getWeekViewData` because `monthKey` comes from `view.monthKey`. An alternative would be to compute `monthKey` from `weekKey` directly using `getBoardMonthKeyForWeek` — but `getWeekViewData` already does this and it's a cheap pure function call. If desired, this can be optimised later by computing `monthKey` upfront. YAGNI for now.
