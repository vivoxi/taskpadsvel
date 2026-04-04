import {
  MONTHLY_PLAN_DAYS,
  MONTHLY_PLAN_WEEKS
} from './monthlyPlan';
import type { PersistedPeriodTaskInstance } from './periodInstances';
import { getMonthWeekKey } from './weekUtils';

type MonthlyPlacement = {
  preferred_week_of_month: number | null;
  preferred_day: PersistedPeriodTaskInstance['preferred_day'];
};

export function moveMonthlyInstance(
  instances: PersistedPeriodTaskInstance[],
  instanceKey: string,
  placement: MonthlyPlacement
): PersistedPeriodTaskInstance[] {
  const instance = instances.find((item) => item.instance_key === instanceKey);
  if (!instance) return instances;

  return [
    ...instances.filter((item) => item.instance_key !== instanceKey),
    {
      ...instance,
      ...placement
    }
  ];
}

export function moveWeeklyInstance(
  instances: PersistedPeriodTaskInstance[],
  instanceKey: string,
  weekKey: string,
  preferredDay: PersistedPeriodTaskInstance['preferred_day']
): PersistedPeriodTaskInstance[] {
  const instance = instances.find((item) => item.instance_key === instanceKey);
  if (!instance) return instances;

  return [
    ...instances.filter((item) => item.instance_key !== instanceKey),
    {
      ...instance,
      id: instance.instance_key,
      period_key: weekKey,
      preferred_day: preferredDay
    }
  ];
}

export function buildWeeklyCellMap(
  monthKey: string,
  weeklyInstancesByWeek: Record<string, PersistedPeriodTaskInstance[]>
): Record<string, PersistedPeriodTaskInstance[]> {
  const nextCells: Record<string, PersistedPeriodTaskInstance[]> = {};

  for (const week of MONTHLY_PLAN_WEEKS) {
    const weekKey = getMonthWeekKey(monthKey, week);
    const weekInstances = weeklyInstancesByWeek[weekKey] ?? [];

    weekInstances.forEach((instance, index) => {
      const day = instance.preferred_day ?? MONTHLY_PLAN_DAYS[index % MONTHLY_PLAN_DAYS.length];
      if (!(MONTHLY_PLAN_DAYS as readonly string[]).includes(day)) return;

      const cellKey = `${week}:${day}`;
      if (!nextCells[cellKey]) nextCells[cellKey] = [];
      nextCells[cellKey].push({
        ...instance,
        preferred_day: day as PersistedPeriodTaskInstance['preferred_day']
      });
    });
  }

  return nextCells;
}
