import { describe, expect, it } from 'vitest';
import {
  buildMissingTemplateRows,
  collectExistingMaterializationState,
  shouldSyncInstancePlanningDefaults
} from '../src/lib/server/planner/materialize';
import { summarizeScheduleReset } from '../src/lib/server/planner/schedule';

describe('planner materialization helpers', () => {
  it('does not duplicate task_instances that already exist for a month', () => {
    const instances = [
      {
        id: 'i1',
        template_id: 't-weekly',
        instance_kind: 'weekly',
        week_key: '2026-W18'
      },
      {
        id: 'i2',
        template_id: 't-monthly',
        instance_kind: 'monthly',
        week_key: null
      }
    ];

    const state = collectExistingMaterializationState(instances as never);
    expect(state.weeklyKeys.has('t-weekly:2026-W18')).toBe(true);
    expect(state.monthlyTemplateIds.has('t-monthly')).toBe(true);

    const missing = buildMissingTemplateRows({
      monthKey: '2026-05',
      templates: [
        { id: 't-weekly', active: true, kind: 'weekly' },
        { id: 't-monthly', active: true, kind: 'monthly' }
      ] as never,
      existingInstances: instances as never
    });

    expect(missing.missingWeeklyKeys).not.toContain('t-weekly:2026-W18');
    expect(missing.missingMonthlyTemplateIds).not.toContain('t-monthly');
  });

  it('syncs template default day and week without overwriting custom placement unnecessarily', () => {
    const updates = shouldSyncInstancePlanningDefaults({
      instance: {
        instance_kind: 'monthly',
        preferred_day: 'Monday',
        day_name: 'Monday',
        preferred_week: 1,
        week_of_month: 1,
        month_key: '2026-05'
      },
      template: {
        kind: 'monthly',
        preferred_day: 'Wednesday',
        preferred_week_of_month: 3
      }
    });

    expect(updates).toMatchObject({
      preferred_day: 'Wednesday',
      day_name: 'Wednesday',
      preferred_week: 3,
      week_of_month: 3
    });
  });
});

describe('schedule reset summary', () => {
  it('keeps locked blocks while counting only removable generated blocks', () => {
    const summary = summarizeScheduleReset([
      { id: 'a', locked: false },
      { id: 'b', locked: true },
      { id: 'c', locked: false }
    ] as never);

    expect(summary).toEqual({
      removedBlocks: 2,
      lockedBlocksKept: 1
    });
  });
});
