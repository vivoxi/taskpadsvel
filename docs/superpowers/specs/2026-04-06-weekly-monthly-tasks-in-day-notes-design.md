# Design: Weekly & Monthly Tasks in Day Note Checklist

**Date:** 2026-04-06
**Scope:** `/week` page — show day-assigned weekly and monthly task instances as checklist items inside each day's note block.

---

## Problem

`DayNoteEditor` already renders assigned weekly tasks as a checklist per day. Monthly task instances assigned to a specific day are never loaded on the `/week` page, so they are invisible here even when they have a `day_name` set.

## Goal

For each day card on `/week`, show both weekly and monthly task instances that are assigned to that day as checklist items — toggleable in place.

---

## Architecture

**Single change:** `src/routes/week/+page.server.ts`

No component changes. `DayNoteEditor` already accepts `TaskInstance[]` and renders + toggles them regardless of `instance_kind`.

### Load function changes

1. Run two Supabase queries in parallel:
   - Existing: weekly instances where `week_key = weekKey`
   - New: monthly instances where `month_key = monthKey` and `day_name IS NOT NULL`

2. Compute `weekIndex = getWeekIndexForMonth(weekKey, monthKey)` (returns 1–4 or null).

3. Filter monthly instances to those matching the current week:
   - `week_of_month === weekIndex` OR `week_of_month === null`

4. Merge filtered monthly instances into `byDay` alongside weekly instances.

### Filtering logic (pseudocode)

```ts
const weekIndex = getWeekIndexForMonth(weekKey, monthKey);

const relevantMonthly = (monthlyRows ?? []).filter(
  (t) => t.day_name !== null &&
    (t.week_of_month === null || t.week_of_month === weekIndex)
);

for (const task of relevantMonthly) {
  const bucket = byDay[task.day_name!] ?? [];
  bucket.push(task);
  byDay[task.day_name!] = bucket;
}
```

---

## Data Flow

```
+page.server.ts
  ├── getWeekViewData(weekKey)        → view (weekly instances + day notes)
  └── supabase: monthly instances     → filtered by day_name + week_of_month
          ↓
      byDay map (weekly + monthly merged)
          ↓
      DayNoteEditor (tasks prop) — no change
          ↓
      /api/task-instances/[id] PATCH — no change
```

---

## What does NOT change

- `DayNoteEditor.svelte` — untouched
- `getWeekViewData` in `planner.ts` — untouched
- `WeekViewData` type — untouched
- API endpoints — untouched
- Right sidebar (unassigned / done panels) — still shows only weekly instances

---

## Edge Cases

- `weekIndex === null` (week not in month board): monthly tasks with `week_of_month` set are excluded; those with `week_of_month === null` are still shown.
- Monthly instance already completed: renders with strikethrough, same as weekly.
- Day with no assigned tasks of either kind: renders as before (empty task section hidden).
