import { MONTHLY_PLAN_DAYS, MONTHLY_PLAN_WEEKS } from './monthlyPlan';
import type { PersistedPeriodTaskInstance } from './periodInstances';
import { getMonthWeekKey } from './weekUtils';

const CHUNK_HOURS = 1;
const MONTHLY_DAY_PRIORITY = ['Thursday', 'Friday', 'Wednesday', 'Tuesday', 'Monday'] as const;
const WEEKLY_DAY_PRIORITY = [...MONTHLY_PLAN_DAYS];

type IdFactory = (kind: 'monthly' | 'weekly', templateId: string, periodKey: string) => string;

export type GeneratedMonthlySpread = {
  monthlyInstances: PersistedPeriodTaskInstance[];
  weeklyInstancesByWeek: Record<string, PersistedPeriodTaskInstance[]>;
};

function defaultIdFactory(kind: 'monthly' | 'weekly', templateId: string, periodKey: string): string {
  return `${kind}:${templateId}:${periodKey}:${crypto.randomUUID()}`;
}

function getChunkHours(totalHours: number | null): number[] {
  const normalizedHours =
    typeof totalHours === 'number' && Number.isFinite(totalHours) && totalHours > 0 ? totalHours : 1;
  const chunks: number[] = [];
  let remaining = normalizedHours;

  while (remaining > 0) {
    const nextChunk = Math.min(CHUNK_HOURS, Number(remaining.toFixed(2)));
    chunks.push(nextChunk);
    remaining = Number((remaining - nextChunk).toFixed(2));
  }

  return chunks.length > 0 ? chunks : [1];
}

function getMonthlyDayOrder(instance: PersistedPeriodTaskInstance): readonly string[] {
  if (instance.preferred_day) {
    return [
      instance.preferred_day,
      ...MONTHLY_PLAN_DAYS.filter((day) => day !== instance.preferred_day)
    ];
  }

  return MONTHLY_DAY_PRIORITY;
}

function getWeeklyDayOrder(instance: PersistedPeriodTaskInstance): readonly string[] {
  if (instance.preferred_day) {
    return [
      instance.preferred_day,
      ...WEEKLY_DAY_PRIORITY.filter((day) => day !== instance.preferred_day)
    ];
  }

  return WEEKLY_DAY_PRIORITY;
}

function createLoadMap(): Record<string, number> {
  return {};
}

function addLoad(loadMap: Record<string, number>, key: string, hours: number) {
  loadMap[key] = Number(((loadMap[key] ?? 0) + hours).toFixed(2));
}

function getMonthlyCellScore(
  instance: PersistedPeriodTaskInstance,
  week: number,
  day: string,
  loadMap: Record<string, number>
): number {
  const cellKey = `${week}:${day}`;
  const preferredWeekPenalty =
    instance.preferred_week_of_month !== null && instance.preferred_week_of_month !== week ? 1000 : 0;
  const preferredDayPenalty =
    instance.preferred_day !== null && instance.preferred_day !== day ? 1000 : 0;
  const dayBias = getMonthlyDayOrder(instance).indexOf(day);
  const load = loadMap[cellKey] ?? 0;

  return preferredWeekPenalty + preferredDayPenalty + load * 10 + Math.max(dayBias, 0) + week * 0.1;
}

function getWeeklyCellScore(
  instance: PersistedPeriodTaskInstance,
  day: string,
  loadMap: Record<string, number>
): number {
  const preferredDayPenalty =
    instance.preferred_day !== null && instance.preferred_day !== day ? 1000 : 0;
  const dayBias = getWeeklyDayOrder(instance).indexOf(day);
  const load = loadMap[day] ?? 0;

  return preferredDayPenalty + load * 10 + Math.max(dayBias, 0);
}

function sortInstancesForGeneration(instances: PersistedPeriodTaskInstance[]): PersistedPeriodTaskInstance[] {
  return [...instances].sort((a, b) => {
    const aHours = a.estimated_hours ?? 1;
    const bHours = b.estimated_hours ?? 1;

    return (
      bHours - aHours || a.title.localeCompare(b.title, 'tr')
    );
  });
}

export function generateMonthlySpread(input: {
  monthKey: string;
  monthlyTemplateInstances: PersistedPeriodTaskInstance[];
  weeklyTemplateInstancesByWeek: Record<number, PersistedPeriodTaskInstance[]>;
  idFactory?: IdFactory;
}): GeneratedMonthlySpread {
  const idFactory = input.idFactory ?? defaultIdFactory;
  const monthlyLoadMap = createLoadMap();
  const monthlyInstances: PersistedPeriodTaskInstance[] = [];

  for (const instance of sortInstancesForGeneration(input.monthlyTemplateInstances)) {
    for (const chunkHours of getChunkHours(instance.estimated_hours)) {
      const bestCell = MONTHLY_PLAN_WEEKS.flatMap((week) =>
        MONTHLY_PLAN_DAYS.map((day) => ({
          week,
          day,
          score: getMonthlyCellScore(instance, week, day, monthlyLoadMap)
        }))
      ).sort((a, b) => a.score - b.score)[0];

      if (!bestCell) continue;

      const instanceKey = idFactory('monthly', instance.template_id, input.monthKey);
      monthlyInstances.push({
        ...instance,
        id: instanceKey,
        instance_key: instanceKey,
        period_key: input.monthKey,
        period_type: 'monthly',
        preferred_week_of_month: bestCell.week,
        preferred_day: bestCell.day as PersistedPeriodTaskInstance['preferred_day'],
        estimated_hours: chunkHours,
        completed: false
      });
      addLoad(monthlyLoadMap, `${bestCell.week}:${bestCell.day}`, chunkHours);
    }
  }

  const weeklyInstancesByWeek: Record<string, PersistedPeriodTaskInstance[]> = {};

  for (const week of MONTHLY_PLAN_WEEKS) {
    const weekKey = getMonthWeekKey(input.monthKey, week);
    const weeklyLoadMap = createLoadMap();
    const generatedWeekInstances: PersistedPeriodTaskInstance[] = [];

    for (const instance of sortInstancesForGeneration(input.weeklyTemplateInstancesByWeek[week] ?? [])) {
      for (const chunkHours of getChunkHours(instance.estimated_hours)) {
        const bestDay = WEEKLY_DAY_PRIORITY.map((day) => ({
          day,
          score: getWeeklyCellScore(instance, day, weeklyLoadMap)
        })).sort((a, b) => a.score - b.score)[0];

        if (!bestDay) continue;

        const instanceKey = idFactory('weekly', instance.template_id, weekKey);
        generatedWeekInstances.push({
          ...instance,
          id: instanceKey,
          instance_key: instanceKey,
          period_key: weekKey,
          period_type: 'weekly',
          preferred_week_of_month: week,
          preferred_day: bestDay.day as PersistedPeriodTaskInstance['preferred_day'],
          estimated_hours: chunkHours,
          completed: false
        });
        addLoad(weeklyLoadMap, bestDay.day, chunkHours);
      }
    }

    weeklyInstancesByWeek[weekKey] = generatedWeekInstances;
  }

  return {
    monthlyInstances,
    weeklyInstancesByWeek
  };
}
