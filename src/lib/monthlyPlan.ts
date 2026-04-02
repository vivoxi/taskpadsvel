import { materializeMonthlyTaskInstances, type MaterializedTaskInstance } from './recurringTasks';
import type { PersistedPeriodTaskInstance } from './periodInstances';
import { PREFERRED_DAY_OPTIONS } from './taskDetails';
import type { Task } from './types';

export const MONTHLY_PLAN_WEEKS = [1, 2, 3, 4] as const;
export const MONTHLY_PLAN_DAYS = PREFERRED_DAY_OPTIONS.slice(0, 5);

export type MonthlyPlanCell = {
  week: number;
  day: string;
  tasks: MaterializedTaskInstance[];
};

export type MonthlyPlanBoard = {
  cells: MonthlyPlanCell[];
  flexibleTasks: MaterializedTaskInstance[];
};

function sortTasks(tasks: MaterializedTaskInstance[]): MaterializedTaskInstance[] {
  return [...tasks].sort((a, b) => {
    const aHours = a.estimated_hours ?? 0;
    const bHours = b.estimated_hours ?? 0;
    return bHours - aHours || a.title.localeCompare(b.title);
  });
}

export function buildMonthlyPlanBoard(tasks: Task[], monthKey: string): MonthlyPlanBoard {
  const instances = materializeMonthlyTaskInstances(tasks, monthKey);
  return buildMonthlyPlanBoardFromInstances(instances);
}

export function buildMonthlyPlanBoardFromInstances(
  instances: Array<MaterializedTaskInstance | PersistedPeriodTaskInstance>
): MonthlyPlanBoard {
  const cells: MonthlyPlanCell[] = [];

  for (const week of MONTHLY_PLAN_WEEKS) {
    for (const day of MONTHLY_PLAN_DAYS) {
      cells.push({
        week,
        day,
        tasks: sortTasks(
          instances.filter(
            (task) => task.preferred_week_of_month === week && task.preferred_day === day
          )
        )
      });
    }
  }

  const flexibleTasks = sortTasks(
    instances.filter(
      (task) =>
        task.preferred_week_of_month === null ||
        task.preferred_day === null ||
        !MONTHLY_PLAN_DAYS.includes(task.preferred_day)
    )
  );

  return { cells, flexibleTasks };
}
