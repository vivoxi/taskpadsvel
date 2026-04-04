import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  addDays,
  addWeeks as dateFnsAddWeeks,
  addMonths as dateFnsAddMonths,
  format
} from 'date-fns';

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export function getWeekKey(date: Date = new Date()): string {
  const week = getISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-M${month}`;
}

export function getWeekDays(weekKey: string): Date[] {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = startOfISOWeek(jan4);
  const monday = addDays(startOfWeek1, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekLabel(weekKey: string): string {
  const days = getWeekDays(weekKey);
  const start = days[0];
  const end = days[6];
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
  }
  return `${format(start, 'MMM d')}–${format(end, 'MMM d, yyyy')}`;
}

export function monthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-M');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return format(date, 'MMMM yyyy');
}

export function addWeeks(date: Date, weeks: number): Date {
  return dateFnsAddWeeks(date, weeks);
}

export function addMonths(date: Date, months: number): Date {
  return dateFnsAddMonths(date, months);
}

export function getPreviousWeekKey(weekKey: string): string {
  const weekDays = getWeekDays(weekKey);
  const previousWeekAnchor = addDays(weekDays[0] ?? new Date(), -7);
  return getWeekKey(previousWeekAnchor);
}

export function getPreviousMonthKey(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-M');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return getMonthKey(dateFnsAddMonths(date, -1));
}

export function getMonthWeekKey(monthKey: string, weekOfMonth: number): string {
  const [yearStr, monthStr] = monthKey.split('-M');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const anchorDay = Math.max(1, (weekOfMonth - 1) * 7 + 3);
  return getWeekKey(new Date(year, monthIndex, anchorDay));
}

export function getWeekOfMonth(weekKey: string): number {
  const days = getWeekDays(weekKey);
  const anchor = days[2];
  return Math.ceil(anchor.getDate() / 7);
}

export function getBoardMonthKeyForWeek(weekKey: string): string {
  const days = getWeekDays(weekKey);
  const boardAnchor = days[4] ?? days[2] ?? days[0] ?? new Date();
  return getMonthKey(boardAnchor);
}

export function getBoardWeekOfMonth(weekKey: string, monthKey = getBoardMonthKeyForWeek(weekKey)): number {
  for (const weekOfMonth of [1, 2, 3, 4]) {
    if (getMonthWeekKey(monthKey, weekOfMonth) === weekKey) {
      return weekOfMonth;
    }
  }

  const days = getWeekDays(weekKey);
  const boardAnchor = days[4] ?? days[2] ?? days[0] ?? new Date();
  return Math.max(1, Math.min(4, Math.ceil(boardAnchor.getDate() / 7)));
}
