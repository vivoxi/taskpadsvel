import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  parseISO,
  startOfISOWeek,
  startOfMonth
} from 'date-fns';
import { DAY_NAMES, type DayName, type MonthWeekSlot } from '$lib/planner/types';

export function getWeekKey(date: Date = new Date()): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

export function getMonthKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM');
}

export function parseMonthKey(monthKey: string): Date {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return startOfMonth(new Date());
  }

  return parseISO(`${monthKey}-01`);
}

export function normalizeMonthKey(monthKey: string | null | undefined): string {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return getMonthKey();
  }

  return getMonthKey(parseMonthKey(monthKey));
}

export function canAutoMaterializeMonthKey(
  monthKey: string,
  now: Date = new Date(),
  pastMonthLimit = 24,
  futureMonthLimit = 24
): boolean {
  const target = startOfMonth(parseMonthKey(monthKey));
  const earliest = startOfMonth(addMonths(now, -pastMonthLimit));
  const latest = endOfMonth(addMonths(now, futureMonthLimit));

  return target.getTime() >= earliest.getTime() && target.getTime() <= latest.getTime();
}

export function getWeekDays(weekKey: string): Date[] {
  const [yearPart, weekPart] = weekKey.split('-W');
  const year = Number.parseInt(yearPart, 10);
  const week = Number.parseInt(weekPart, 10);

  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    return Array.from({ length: 7 }, (_, index) => addDays(startOfISOWeek(new Date()), index));
  }

  const firstWeekAnchor = new Date(year, 0, 4);
  const firstMonday = startOfISOWeek(firstWeekAnchor);
  const weekStart = addDays(firstMonday, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function normalizeWeekKey(weekKey: string | null | undefined): string {
  if (!weekKey || !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    return getWeekKey();
  }

  return getWeekKey(getWeekDays(weekKey)[0] ?? new Date());
}

export function weekLabel(weekKey: string): string {
  const days = getWeekDays(weekKey);
  const start = days[0] ?? new Date();
  const finish = days[6] ?? start;

  if (start.getMonth() === finish.getMonth()) {
    return `${format(start, 'MMM d')} - ${format(finish, 'd, yyyy')}`;
  }

  return `${format(start, 'MMM d')} - ${format(finish, 'MMM d, yyyy')}`;
}

export function monthLabel(monthKey: string): string {
  return format(parseMonthKey(monthKey), 'MMMM yyyy');
}

export function getPreviousWeekKey(weekKey: string): string {
  return getWeekKey(addWeeks(getWeekDays(weekKey)[0] ?? new Date(), -1));
}

export function getNextWeekKey(weekKey: string): string {
  return getWeekKey(addWeeks(getWeekDays(weekKey)[0] ?? new Date(), 1));
}

export function getPreviousMonthKey(monthKey: string): string {
  return getMonthKey(addMonths(parseMonthKey(monthKey), -1));
}

export function getNextMonthKey(monthKey: string): string {
  return getMonthKey(addMonths(parseMonthKey(monthKey), 1));
}

export function getBoardMonthKeyForWeek(weekKey: string): string {
  const boardAnchor = getWeekDays(weekKey)[4] ?? getWeekDays(weekKey)[2] ?? new Date();
  return getMonthKey(boardAnchor);
}

export function getBoardWeeksForMonth(monthKey: string): MonthWeekSlot[] {
  const start = startOfMonth(parseMonthKey(monthKey));
  const finish = endOfMonth(start);
  const seen = new Set<string>();
  const result: MonthWeekSlot[] = [];

  for (let cursor = start; cursor <= finish; cursor = addDays(cursor, 1)) {
    const weekKey = getWeekKey(cursor);
    if (seen.has(weekKey) || getBoardMonthKeyForWeek(weekKey) !== monthKey) {
      continue;
    }

    seen.add(weekKey);
    result.push({
      index: result.length + 1,
      weekKey,
      label: weekLabel(weekKey),
      shortLabel: `Week ${result.length + 1}`
    });
  }

  return result;
}

export function getWeekIndexForMonth(weekKey: string, monthKey: string): number | null {
  const entry = getBoardWeeksForMonth(monthKey).find((item) => item.weekKey === weekKey);
  return entry?.index ?? null;
}

export function getTodayDayName(weekKey: string): DayName | null {
  const today = new Date();
  const days = getWeekDays(weekKey);
  const index = days.findIndex((entry) => isSameDay(entry, today));
  return index >= 0 ? DAY_NAMES[index] : null;
}

export function formatDayChip(weekKey: string, dayName: DayName): string {
  const dayIndex = DAY_NAMES.indexOf(dayName);
  const date = getWeekDays(weekKey)[dayIndex];
  return date ? format(date, 'EEE d') : dayName;
}

export function formatDayDate(weekKey: string, dayName: DayName): string {
  const dayIndex = DAY_NAMES.indexOf(dayName);
  const date = getWeekDays(weekKey)[dayIndex];
  return date ? format(date, 'd MMM') : dayName;
}

export function toIsoDate(weekKey: string, dayName: DayName): string {
  const dayIndex = DAY_NAMES.indexOf(dayName);
  const date = getWeekDays(weekKey)[dayIndex];
  return date ? format(date, 'yyyy-MM-dd') : '';
}
