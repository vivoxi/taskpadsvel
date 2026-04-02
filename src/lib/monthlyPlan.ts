import { materializeMonthlyTaskInstances, type MaterializedTaskInstance } from './recurringTasks';
import type { PersistedPeriodTaskInstance } from './periodInstances';
import { PREFERRED_DAY_OPTIONS } from './taskDetails';
import type { Task } from './types';

export const MONTHLY_PLAN_WEEKS = [1, 2, 3, 4] as const;
export const MONTHLY_PLAN_DAYS = PREFERRED_DAY_OPTIONS.slice(0, 5);

type MonthlyPlanTask = MaterializedTaskInstance | PersistedPeriodTaskInstance;

export type MonthlyPlanCell = {
  week: number;
  day: string;
  tasks: MonthlyPlanTask[];
};

export type MonthlyPlanBoard = {
  cells: MonthlyPlanCell[];
  flexibleTasks: MonthlyPlanTask[];
};

function copyTasks<T extends MonthlyPlanTask>(tasks: T[]): T[] {
  return [...tasks];
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
        tasks: copyTasks(
          instances.filter(
            (task) => task.preferred_week_of_month === week && task.preferred_day === day
          )
        )
      });
    }
  }

  const flexibleTasks = copyTasks(
    instances.filter(
      (task) =>
        task.preferred_week_of_month === null ||
        task.preferred_day === null ||
        !MONTHLY_PLAN_DAYS.includes(task.preferred_day)
    )
  );

  return { cells, flexibleTasks };
}
