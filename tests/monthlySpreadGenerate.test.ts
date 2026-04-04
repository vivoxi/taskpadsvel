import { describe, expect, it } from 'vitest';
import { generateMonthlySpread } from '../src/lib/monthlySpreadGenerate';
import type { PersistedPeriodTaskInstance } from '../src/lib/periodInstances';
import { getMonthWeekKey } from '../src/lib/weekUtils';

function makeInstance(
  overrides: Partial<PersistedPeriodTaskInstance> = {}
): PersistedPeriodTaskInstance {
  return {
    id: 'template',
    template_id: 'template',
    title: 'Task',
    type: 'monthly',
    completed: false,
    notes: '',
    scheduling_notes: '',
    created_at: '2026-04-04T00:00:00.000Z',
    period_key: '2026-M04',
    period_type: 'monthly',
    instance_key: 'template',
    estimated_hours: 1,
    preferred_week_of_month: null,
    preferred_day: null,
    category: null,
    carryover: false,
    carryover_source_period_key: null,
    ...overrides
  };
}

describe('monthlySpreadGenerate', () => {
  it('splits monthly template hours into one-hour chunks and distributes them', () => {
    const ids: string[] = [];
    const result = generateMonthlySpread({
      monthKey: '2026-M04',
      monthlyTemplateInstances: [
        makeInstance({
          template_id: 'm1',
          title: 'Deep work',
          estimated_hours: 3,
          carryover: true
        })
      ],
      weeklyTemplateInstancesByWeek: {},
      idFactory: (kind, templateId, periodKey) => {
        const id = `${kind}:${templateId}:${periodKey}:${ids.length + 1}`;
        ids.push(id);
        return id;
      }
    });

    expect(result.monthlyInstances).toHaveLength(3);
    expect(result.monthlyInstances.every((instance) => instance.estimated_hours === 1)).toBe(true);
    expect(new Set(result.monthlyInstances.map((instance) => instance.instance_key)).size).toBe(3);
  });

  it('keeps exact week/day preferences for monthly tasks', () => {
    const result = generateMonthlySpread({
      monthKey: '2026-M04',
      monthlyTemplateInstances: [
        makeInstance({
          template_id: 'm1',
          preferred_week_of_month: 3,
          preferred_day: 'Friday',
          estimated_hours: 2
        })
      ],
      weeklyTemplateInstancesByWeek: {},
      idFactory: (kind, templateId, periodKey) => `${kind}:${templateId}:${periodKey}:${Math.random()}`
    });

    expect(result.monthlyInstances).toHaveLength(2);
    expect(result.monthlyInstances.every((instance) => instance.preferred_week_of_month === 3)).toBe(true);
    expect(result.monthlyInstances.every((instance) => instance.preferred_day === 'Friday')).toBe(true);
  });

  it('generates weekly copies inside each month week with balanced weekday placement', () => {
    const weekOneTemplate = makeInstance({
      id: 'w-template',
      template_id: 'w1',
      title: 'Weekly ops',
      type: 'weekly',
      period_type: 'weekly',
      period_key: getMonthWeekKey('2026-M04', 1),
      instance_key: 'weekly-source',
      estimated_hours: 3
    });

    const result = generateMonthlySpread({
      monthKey: '2026-M04',
      monthlyTemplateInstances: [],
      weeklyTemplateInstancesByWeek: {
        1: [weekOneTemplate]
      },
      idFactory: (kind, templateId, periodKey) => `${kind}:${templateId}:${periodKey}:${Math.random()}`
    });

    const weekKey = getMonthWeekKey('2026-M04', 1);
    expect(result.weeklyInstancesByWeek[weekKey]).toHaveLength(3);
    expect(new Set(result.weeklyInstancesByWeek[weekKey].map((instance) => instance.preferred_day)).size).toBe(3);
  });

  it('honors explicit weekly preferred day across generated copies', () => {
    const weekOneTemplate = makeInstance({
      id: 'w-template',
      template_id: 'w1',
      title: 'Finance',
      type: 'weekly',
      period_type: 'weekly',
      period_key: getMonthWeekKey('2026-M04', 1),
      instance_key: 'weekly-source',
      estimated_hours: 2,
      preferred_day: 'Tuesday'
    });

    const result = generateMonthlySpread({
      monthKey: '2026-M04',
      monthlyTemplateInstances: [],
      weeklyTemplateInstancesByWeek: {
        1: [weekOneTemplate]
      },
      idFactory: (kind, templateId, periodKey) => `${kind}:${templateId}:${periodKey}:${Math.random()}`
    });

    const weekKey = getMonthWeekKey('2026-M04', 1);
    expect(result.weeklyInstancesByWeek[weekKey]).toHaveLength(2);
    expect(result.weeklyInstancesByWeek[weekKey].every((instance) => instance.preferred_day === 'Tuesday')).toBe(true);
  });
});
