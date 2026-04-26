import { getBoardWeeksForMonth } from '$lib/planner/dates';
import type { DayName, TaskInstance, TaskTemplate } from '$lib/planner/types';
export { ensureMonthPlanInstances, getDefaultMonthlyWeekKey, getTemplateDefaultSyncUpdates } from './legacy';

export function buildWeeklyInstanceKey(templateId: string | null, weekKey: string | null): string | null {
  if (!templateId || !weekKey) return null;
  return `${templateId}:${weekKey}`;
}

export function collectExistingMaterializationState(instances: TaskInstance[]) {
  return {
    weeklyKeys: new Set(
      instances
        .filter((instance) => instance.instance_kind === 'weekly')
        .map((instance) => buildWeeklyInstanceKey(instance.template_id, instance.week_key))
        .filter((value): value is string => Boolean(value))
    ),
    monthlyTemplateIds: new Set(
      instances
        .filter((instance) => instance.instance_kind === 'monthly' && instance.template_id)
        .map((instance) => instance.template_id as string)
    )
  };
}

export function buildMissingTemplateRows(input: {
  monthKey: string;
  templates: TaskTemplate[];
  existingInstances: TaskInstance[];
}) {
  const weeks = getBoardWeeksForMonth(input.monthKey);
  const { weeklyKeys, monthlyTemplateIds } = collectExistingMaterializationState(input.existingInstances);
  const missingWeeklyKeys: string[] = [];
  const missingMonthlyTemplateIds: string[] = [];

  for (const template of input.templates) {
    if (!template.active) continue;

    if (template.kind === 'weekly') {
      for (const week of weeks) {
        const key = `${template.id}:${week.weekKey}`;
        if (weeklyKeys.has(key)) continue;
        missingWeeklyKeys.push(key);
      }
      continue;
    }

    if (!monthlyTemplateIds.has(template.id)) {
      missingMonthlyTemplateIds.push(template.id);
    }
  }

  return { missingWeeklyKeys, missingMonthlyTemplateIds };
}

export function shouldSyncInstancePlanningDefaults(input: {
  instance: Pick<TaskInstance, 'instance_kind' | 'preferred_day' | 'day_name' | 'preferred_week' | 'week_of_month' | 'month_key'>;
  template: Pick<TaskTemplate, 'kind' | 'preferred_day' | 'preferred_week_of_month'>;
}): {
  preferred_day?: DayName | null;
  day_name?: DayName | null;
  preferred_week?: number | null;
  week_of_month?: number | null;
} {
  const updates: {
    preferred_day?: DayName | null;
    day_name?: DayName | null;
    preferred_week?: number | null;
    week_of_month?: number | null;
  } = {};

  const nextPreferredDay = input.template.preferred_day;
  if (input.instance.preferred_day !== nextPreferredDay) {
    updates.preferred_day = nextPreferredDay;
  }
  if (input.instance.day_name === null || input.instance.day_name === input.instance.preferred_day) {
    updates.day_name = nextPreferredDay;
  }

  if (input.instance.instance_kind === 'monthly') {
    const nextPreferredWeek = input.template.kind === 'monthly' ? input.template.preferred_week_of_month : input.instance.week_of_month;
    if (input.instance.preferred_week !== nextPreferredWeek) {
      updates.preferred_week = nextPreferredWeek;
    }
    if (input.instance.week_of_month === null || input.instance.week_of_month === input.instance.preferred_week) {
      updates.week_of_month = nextPreferredWeek;
    }
  }

  return updates;
}
