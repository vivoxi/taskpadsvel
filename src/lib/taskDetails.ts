import type { Task } from './types';

const TASK_META_PREFIX = '__TASKPAD_META__';
export const PREFERRED_DAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export type PreferredDay = (typeof PREFERRED_DAY_OPTIONS)[number];

export interface ParsedTaskDetails {
  notes: string;
  estimatedHours: number | null;
  preferredWeekOfMonth: number | null;
  preferredDay: PreferredDay | null;
  category: string | null;
  indentLevel: number;
}

export interface SchedulableTask extends Task {
  scheduling_notes: string;
  estimated_hours: number | null;
  preferred_week_of_month: number | null;
  preferred_day: PreferredDay | null;
  category: string | null;
}

export function parseTaskDetails(rawNotes: string | null | undefined): ParsedTaskDetails {
  const value = rawNotes ?? '';

  if (!value.startsWith(TASK_META_PREFIX)) {
    return {
      notes: value,
      estimatedHours: null,
      preferredWeekOfMonth: null,
      preferredDay: null,
      category: null,
      indentLevel: 0
    };
  }

  const newlineIndex = value.indexOf('\n');
  const metadataLine = newlineIndex === -1 ? value : value.slice(0, newlineIndex);
  const notes = newlineIndex === -1 ? '' : value.slice(newlineIndex + 1);

  try {
    const metadata = JSON.parse(metadataLine.slice(TASK_META_PREFIX.length)) as {
      estimatedHours?: number | null;
      preferredWeekOfMonth?: number | null;
      preferredDay?: string | null;
      category?: string | null;
      indentLevel?: number | null;
    };

    return {
      notes,
      estimatedHours:
        typeof metadata.estimatedHours === 'number' && Number.isFinite(metadata.estimatedHours)
          ? metadata.estimatedHours
          : null,
      preferredWeekOfMonth:
        typeof metadata.preferredWeekOfMonth === 'number' &&
        Number.isInteger(metadata.preferredWeekOfMonth) &&
        metadata.preferredWeekOfMonth >= 1 &&
        metadata.preferredWeekOfMonth <= 4
          ? metadata.preferredWeekOfMonth
          : null,
      preferredDay:
        typeof metadata.preferredDay === 'string' &&
        PREFERRED_DAY_OPTIONS.includes(metadata.preferredDay as PreferredDay)
          ? (metadata.preferredDay as PreferredDay)
          : null,
      category: typeof metadata.category === 'string' && metadata.category.trim()
        ? metadata.category.trim()
        : null,
      indentLevel:
        typeof metadata.indentLevel === 'number' &&
        Number.isInteger(metadata.indentLevel) &&
        metadata.indentLevel >= 0 &&
        metadata.indentLevel <= 6
          ? metadata.indentLevel
          : 0
    };
  } catch {
    return {
      notes: value,
      estimatedHours: null,
      preferredWeekOfMonth: null,
      preferredDay: null,
      category: null,
      indentLevel: 0
    };
  }
}

export function serializeTaskDetails(
  notes: string,
  estimatedHours: number | null,
  preferredWeekOfMonth: number | null = null,
  preferredDay: PreferredDay | null = null,
  category: string | null = null,
  indentLevel = 0
): string {
  const normalizedNotes = notes.trimEnd();
  const normalizedHours =
    typeof estimatedHours === 'number' && Number.isFinite(estimatedHours) && estimatedHours > 0
      ? Number(estimatedHours.toFixed(2))
      : null;
  const normalizedPreferredWeek =
    typeof preferredWeekOfMonth === 'number' &&
    Number.isInteger(preferredWeekOfMonth) &&
    preferredWeekOfMonth >= 1 &&
    preferredWeekOfMonth <= 4
      ? preferredWeekOfMonth
      : null;
  const normalizedPreferredDay = preferredDay && PREFERRED_DAY_OPTIONS.includes(preferredDay)
    ? preferredDay
    : null;
  const normalizedCategory = typeof category === 'string' && category.trim() ? category.trim() : null;
  const normalizedIndentLevel =
    Number.isInteger(indentLevel) && indentLevel > 0
      ? Math.min(6, Math.max(0, indentLevel))
      : 0;

  if (
    normalizedHours === null &&
    normalizedPreferredWeek === null &&
    normalizedPreferredDay === null &&
    normalizedCategory === null &&
    normalizedIndentLevel === 0
  ) {
    return normalizedNotes;
  }

  const metadata = `${TASK_META_PREFIX}${JSON.stringify({
    estimatedHours: normalizedHours,
    preferredWeekOfMonth: normalizedPreferredWeek,
    preferredDay: normalizedPreferredDay,
    category: normalizedCategory,
    indentLevel: normalizedIndentLevel
  })}`;
  return normalizedNotes ? `${metadata}\n${normalizedNotes}` : metadata;
}

export function parseEstimatedHoursInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function toSchedulableTask(task: Task): SchedulableTask {
  const details = parseTaskDetails(task.notes);
  return {
    ...task,
    scheduling_notes: details.notes,
    estimated_hours: details.estimatedHours,
    preferred_week_of_month: details.preferredWeekOfMonth,
    preferred_day: details.preferredDay,
    category: details.category
  };
}
