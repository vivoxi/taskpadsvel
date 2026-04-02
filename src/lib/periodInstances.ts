import {
  materializeMonthlyTaskInstances,
  materializeWeeklyTaskInstances,
  type MaterializedTaskInstance
} from './recurringTasks';
import { PREFERRED_DAY_OPTIONS, type PreferredDay } from './taskDetails';
import type { HistorySnapshot, Task } from './types';

export interface PersistedPeriodTaskInstance extends MaterializedTaskInstance {
  carryover: boolean;
  carryover_source_period_key: string | null;
}

export interface PersistedPeriodInstancesPayload {
  instances: PersistedPeriodTaskInstance[];
  updatedAt: string | null;
}

export interface PersistedPeriodInstanceStatusPayload {
  completedInstanceKeys: string[];
  updatedAt: string | null;
}

export function getWeeklyInstancesStorageKey(weekKey: string): string {
  return `period_instances:weekly:${weekKey}`;
}

export function getMonthlyInstancesStorageKey(monthKey: string): string {
  return `period_instances:monthly:${monthKey}`;
}

export function getWeeklyInstanceStatusStorageKey(weekKey: string): string {
  return `period_instance_status:weekly:${weekKey}`;
}

export function getMonthlyInstanceStatusStorageKey(monthKey: string): string {
  return `period_instance_status:monthly:${monthKey}`;
}

export function getPeriodInstanceStatusStorageKey(
  periodType: 'weekly' | 'monthly',
  periodKey: string
): string {
  return periodType === 'weekly'
    ? getWeeklyInstanceStatusStorageKey(periodKey)
    : getMonthlyInstanceStatusStorageKey(periodKey);
}

function withCarryover(
  instances: MaterializedTaskInstance[],
  previousSnapshot: HistorySnapshot | null | undefined
): PersistedPeriodTaskInstance[] {
  const missedTitles = new Set((previousSnapshot?.missed_tasks ?? []).map((task) => task.title));

  return instances.map((instance) => ({
    ...instance,
    carryover: missedTitles.has(instance.title),
    carryover_source_period_key: missedTitles.has(instance.title)
      ? previousSnapshot?.period_key ?? null
      : null
  }));
}

export function createWeeklyPeriodInstances(input: {
  weekKey: string;
  weeklyTasks: Task[];
  previousWeeklySnapshot?: HistorySnapshot | null;
}): PersistedPeriodTaskInstance[] {
  return withCarryover(
    materializeWeeklyTaskInstances(input.weeklyTasks, input.weekKey),
    input.previousWeeklySnapshot
  );
}

export function createMonthlyPeriodInstances(input: {
  monthKey: string;
  monthlyTasks: Task[];
  previousMonthlySnapshot?: HistorySnapshot | null;
}): PersistedPeriodTaskInstance[] {
  return withCarryover(
    materializeMonthlyTaskInstances(input.monthlyTasks, input.monthKey),
    input.previousMonthlySnapshot
  );
}

function normalizePersistedInstance(value: unknown): PersistedPeriodTaskInstance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return null;

  return {
    id: parsed.id,
    title: parsed.title,
    type:
      parsed.type === 'weekly' || parsed.type === 'monthly' || parsed.type === 'random'
        ? parsed.type
        : 'weekly',
    completed: parsed.completed === true,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    created_at: typeof parsed.created_at === 'string' ? parsed.created_at : new Date(0).toISOString(),
    scheduling_notes:
      typeof parsed.scheduling_notes === 'string' ? parsed.scheduling_notes : '',
    estimated_hours:
      typeof parsed.estimated_hours === 'number' && Number.isFinite(parsed.estimated_hours)
        ? parsed.estimated_hours
        : null,
    preferred_week_of_month:
      typeof parsed.preferred_week_of_month === 'number' && Number.isInteger(parsed.preferred_week_of_month)
        ? parsed.preferred_week_of_month
        : null,
    preferred_day:
      typeof parsed.preferred_day === 'string' &&
      PREFERRED_DAY_OPTIONS.includes(parsed.preferred_day as PreferredDay)
        ? (parsed.preferred_day as PreferredDay)
        : null,
    category: typeof parsed.category === 'string' ? parsed.category : null,
    template_id: typeof parsed.template_id === 'string' ? parsed.template_id : parsed.id,
    period_key: typeof parsed.period_key === 'string' ? parsed.period_key : '',
    period_type: parsed.period_type === 'monthly' ? 'monthly' : 'weekly',
    instance_key:
      typeof parsed.instance_key === 'string'
        ? parsed.instance_key
        : `${parsed.type === 'monthly' ? 'monthly' : 'weekly'}:${parsed.id}:unknown`,
    carryover: parsed.carryover === true,
    carryover_source_period_key:
      typeof parsed.carryover_source_period_key === 'string'
        ? parsed.carryover_source_period_key
        : null
  };
}

export function parsePersistedPeriodInstances(
  value: unknown
): PersistedPeriodInstancesPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  if (!Array.isArray(parsed.instances)) return null;

  return {
    instances: parsed.instances
      .map(normalizePersistedInstance)
      .filter((instance): instance is PersistedPeriodTaskInstance => instance !== null),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
  };
}

export function parsePersistedPeriodInstanceStatus(
  value: unknown
): PersistedPeriodInstanceStatusPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  if (!Array.isArray(parsed.completedInstanceKeys)) return null;

  return {
    completedInstanceKeys: parsed.completedInstanceKeys.filter(
      (item): item is string => typeof item === 'string'
    ),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
  };
}

export function parsePeriodInstanceKey(instanceKey: string): {
  periodType: 'weekly' | 'monthly';
  templateId: string;
  periodKey: string;
} | null {
  const parts = instanceKey.split(':');
  if (parts.length < 3) return null;

  const [periodType, templateId, ...periodParts] = parts;
  if (periodType !== 'weekly' && periodType !== 'monthly') return null;

  return {
    periodType,
    templateId,
    periodKey: periodParts.join(':')
  };
}

export function updateCompletedInstanceKeys(
  keys: string[],
  instanceKey: string,
  completed: boolean
): string[] {
  const next = new Set(keys);
  if (completed) {
    next.add(instanceKey);
  } else {
    next.delete(instanceKey);
  }
  return Array.from(next);
}
