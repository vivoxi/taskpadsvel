import { materializeTasksForWeek, type MaterializedTaskInstance } from '$lib/recurringTasks';
import { DAY_NAMES } from '$lib/weekUtils';
import type { Task, TaskType } from '$lib/types';

export type GeneratedScheduleBlock = {
  day: string;
  start_time: string;
  end_time: string;
  task_title: string;
  notes: string;
  linked_task_id?: string;
  linked_task_type?: TaskType;
  linked_instance_key?: string;
};

type PlannerSlot = {
  day: string;
  startMinutes: number;
  endMinutes: number;
  label: string;
};

type TaskAllocation = {
  task: MaterializedTaskInstance;
  remainingMinutes: number;
};

const WORK_WINDOWS = [
  { startMinutes: 10 * 60, endMinutes: 13 * 60 },
  { startMinutes: 14 * 60, endMinutes: 17 * 60 }
];

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function minutesToTime(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parsePlannerSlots(plannerNotes: Record<string, string>): PlannerSlot[] {
  const slots: PlannerSlot[] = [];
  const slotRegex =
    /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\s*(?:→|->|-)?\s*(.+)?$/;

  for (const day of DAY_NAMES) {
    const note = plannerNotes[day];
    if (!note) continue;

    for (const rawLine of note.split('\n')) {
      const line = rawLine
        .replace(/^[\s>*-]+/, '')
        .replace(/^\[[xX ]\]\s*/, '')
        .trim();

      if (!line) continue;
      const match = line.match(slotRegex);
      if (!match) continue;

      const startMinutes = parseTimeToMinutes(match[1]);
      const endMinutes = parseTimeToMinutes(match[2]);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) continue;

      slots.push({
        day,
        startMinutes,
        endMinutes,
        label: (match[3] ?? '').trim()
      });
    }
  }

  return slots.sort(
    (a, b) =>
      DAY_NAMES.indexOf(a.day as (typeof DAY_NAMES)[number]) -
        DAY_NAMES.indexOf(b.day as (typeof DAY_NAMES)[number]) ||
      a.startMinutes - b.startMinutes
  );
}

function getMatchingScore(task: MaterializedTaskInstance, label: string): number {
  const normalizedLabel = normalizeText(label);
  const normalizedTitle = normalizeText(task.title);
  if (!normalizedLabel || !normalizedTitle) return 0;
  if (normalizedLabel.includes(normalizedTitle)) return 100;
  if (normalizedTitle.includes(normalizedLabel)) return 80;

  const labelTokens = new Set(normalizedLabel.split(' '));
  const titleTokens = normalizedTitle.split(' ');
  return titleTokens.filter((token) => labelTokens.has(token)).length;
}

function getTaskMinutes(task: MaterializedTaskInstance): number {
  return Math.max(30, Math.round((task.estimated_hours ?? 1) * 60));
}

function subtractInterval(
  intervals: Array<{ startMinutes: number; endMinutes: number }>,
  taken: { startMinutes: number; endMinutes: number }
): Array<{ startMinutes: number; endMinutes: number }> {
  const next: Array<{ startMinutes: number; endMinutes: number }> = [];

  for (const interval of intervals) {
    if (taken.endMinutes <= interval.startMinutes || taken.startMinutes >= interval.endMinutes) {
      next.push(interval);
      continue;
    }

    if (taken.startMinutes > interval.startMinutes) {
      next.push({ startMinutes: interval.startMinutes, endMinutes: taken.startMinutes });
    }

    if (taken.endMinutes < interval.endMinutes) {
      next.push({ startMinutes: taken.endMinutes, endMinutes: interval.endMinutes });
    }
  }

  return next.filter((interval) => interval.endMinutes - interval.startMinutes >= 30);
}

function getDayPriority(task: MaterializedTaskInstance): string[] {
  const weekdays = DAY_NAMES.slice(0, 5);
  const weekends = DAY_NAMES.slice(5);

  if (task.preferred_day) {
    return [
      task.preferred_day,
      ...weekdays.filter((day) => day !== task.preferred_day),
      ...weekends.filter((day) => day !== task.preferred_day)
    ];
  }

  if (task.type === 'monthly') {
    return ['Thursday', 'Friday', 'Wednesday', 'Tuesday', 'Monday', 'Saturday', 'Sunday'];
  }

  return [...weekdays, ...weekends];
}

function buildBlock(
  task: MaterializedTaskInstance,
  day: string,
  startMinutes: number,
  endMinutes: number,
  label = ''
): GeneratedScheduleBlock {
  return {
    day,
    start_time: minutesToTime(startMinutes),
    end_time: minutesToTime(endMinutes),
    task_title: task.title,
    notes: label && normalizeText(label) !== normalizeText(task.title) ? label : task.scheduling_notes,
    linked_task_id: task.template_id,
    linked_task_type: task.type,
    linked_instance_key: task.instance_key
  };
}

export function generateRuleBasedSchedule(input: {
  weekKey: string;
  monthKey: string;
  weekOfMonth?: number;
  plannerNotes?: Record<string, string>;
  weeklyTasks: Task[];
  monthlyTasks: Task[];
  carryoverTaskTitles?: string[];
}): GeneratedScheduleBlock[] {
  const plannerNotes = input.plannerNotes ?? {};
  const weekOfMonth = input.weekOfMonth ?? 1;
  const carryoverTitles = new Set((input.carryoverTaskTitles ?? []).map((title) => normalizeText(title)));
  const { weeklyInstances, selectedMonthlyInstances } = materializeTasksForWeek({
    weekKey: input.weekKey,
    monthKey: input.monthKey,
    weekOfMonth,
    weeklyTasks: input.weeklyTasks,
    monthlyTasks: input.monthlyTasks
  });

  const allocations: TaskAllocation[] = [...weeklyInstances, ...selectedMonthlyInstances]
    .map((task) => ({
      task,
      remainingMinutes: getTaskMinutes(task)
    }))
    .sort((a, b) => {
      const aCarryover = carryoverTitles.has(normalizeText(a.task.title)) ? 1 : 0;
      const bCarryover = carryoverTitles.has(normalizeText(b.task.title)) ? 1 : 0;
      return bCarryover - aCarryover || b.remainingMinutes - a.remainingMinutes;
    });

  const freeWindows = new Map(
    DAY_NAMES.map((day) => [day, WORK_WINDOWS.map((window) => ({ ...window }))])
  );

  const blocks: GeneratedScheduleBlock[] = [];
  const plannerSlots = parsePlannerSlots(plannerNotes);

  for (const slot of plannerSlots) {
    const candidates = allocations
      .filter((allocation) => allocation.remainingMinutes > 0)
      .map((allocation) => ({
        allocation,
        score: getMatchingScore(allocation.task, slot.label),
        carryoverBoost: carryoverTitles.has(normalizeText(allocation.task.title)) ? 1 : 0
      }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.carryoverBoost - a.carryoverBoost ||
          a.allocation.remainingMinutes - b.allocation.remainingMinutes
      );

    const match = candidates[0]?.allocation;
    if (!match) continue;

    blocks.push(buildBlock(match.task, slot.day, slot.startMinutes, slot.endMinutes, slot.label));
    match.remainingMinutes = Math.max(0, match.remainingMinutes - (slot.endMinutes - slot.startMinutes));

    freeWindows.set(
      slot.day as (typeof DAY_NAMES)[number],
      subtractInterval(freeWindows.get(slot.day as (typeof DAY_NAMES)[number]) ?? [], {
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes
      })
    );
  }

  for (const allocation of allocations) {
    if (allocation.remainingMinutes <= 0) continue;

    for (const day of getDayPriority(allocation.task)) {
      const windows = [...(freeWindows.get(day as (typeof DAY_NAMES)[number]) ?? [])];
      const nextWindows: Array<{ startMinutes: number; endMinutes: number }> = [];

      for (const window of windows) {
        let cursor = window.startMinutes;

        while (allocation.remainingMinutes > 0 && window.endMinutes - cursor >= 30) {
          const remainingWindow = window.endMinutes - cursor;
          const blockMinutes = Math.min(
            allocation.remainingMinutes > 120 ? 120 : allocation.remainingMinutes,
            remainingWindow
          );

          if (blockMinutes < 30) break;

          blocks.push(buildBlock(allocation.task, day, cursor, cursor + blockMinutes));
          allocation.remainingMinutes -= blockMinutes;
          cursor += blockMinutes;
        }

        if (cursor < window.endMinutes) {
          nextWindows.push({ startMinutes: cursor, endMinutes: window.endMinutes });
        }

        if (allocation.remainingMinutes <= 0) {
          nextWindows.push(...windows.slice(windows.indexOf(window) + 1));
          break;
        }
      }

      freeWindows.set(
        day as (typeof DAY_NAMES)[number],
        nextWindows.filter((interval) => interval.endMinutes - interval.startMinutes >= 30)
      );

      if (allocation.remainingMinutes <= 0) break;
    }
  }

  return blocks.sort(
    (a, b) =>
      DAY_NAMES.indexOf(a.day as (typeof DAY_NAMES)[number]) -
        DAY_NAMES.indexOf(b.day as (typeof DAY_NAMES)[number]) ||
      a.start_time.localeCompare(b.start_time)
  );
}
