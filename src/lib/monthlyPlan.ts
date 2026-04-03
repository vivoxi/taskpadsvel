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
  const cellMap = new Map<string, MonthlyPlanCell>();
  for (const week of MONTHLY_PLAN_WEEKS) {
    for (const day of MONTHLY_PLAN_DAYS) {
      cellMap.set(`${week}:${day}`, { week, day, tasks: [] });
    }
  }

  const weekOnly = new Map<number, MonthlyPlanTask[]>();
  const dayOnly = new Map<string, MonthlyPlanTask[]>();
  const fullyUnplaced: MonthlyPlanTask[] = [];

  for (const task of instances) {
    const weekOk =
      task.preferred_week_of_month !== null &&
      (MONTHLY_PLAN_WEEKS as readonly number[]).includes(task.preferred_week_of_month);
    const dayOk =
      task.preferred_day !== null && MONTHLY_PLAN_DAYS.includes(task.preferred_day);

    if (weekOk && dayOk) {
      cellMap.get(`${task.preferred_week_of_month}:${task.preferred_day}`)?.tasks.push(task);
    } else if (weekOk) {
      const w = task.preferred_week_of_month!;
      if (!weekOnly.has(w)) weekOnly.set(w, []);
      weekOnly.get(w)!.push(task);
    } else if (dayOk) {
      const d = task.preferred_day!;
      if (!dayOnly.has(d)) dayOnly.set(d, []);
      dayOnly.get(d)!.push(task);
    } else {
      fullyUnplaced.push(task);
    }
  }

  for (const [week, tasks] of weekOnly) {
    tasks.forEach((task, i) => {
      cellMap.get(`${week}:${MONTHLY_PLAN_DAYS[i % MONTHLY_PLAN_DAYS.length]}`)?.tasks.push(task);
    });
  }

  for (const [day, tasks] of dayOnly) {
    tasks.forEach((task, i) => {
      cellMap.get(`${MONTHLY_PLAN_WEEKS[i % MONTHLY_PLAN_WEEKS.length]}:${day}`)?.tasks.push(task);
    });
  }

  const allCells = [...cellMap.values()];

  return { cells: allCells, flexibleTasks: fullyUnplaced };
}
