import { describe, expect, it } from 'vitest';
import {
  getBoardMonthKeyForWeek,
  getBoardWeeksForMonth,
  getWeekIndexForMonth,
  getWeekKey,
  normalizeMonthKey,
  normalizeWeekKey
} from '../src/lib/planner/dates';

describe('planner dates', () => {
  it('normalizes invalid keys to current shapes', () => {
    expect(normalizeMonthKey('bad-key')).toMatch(/^\d{4}-\d{2}$/);
    expect(normalizeWeekKey('also-bad')).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('assigns each week to a single planning month', () => {
    const weekKey = getWeekKey(new Date('2026-04-02T12:00:00Z'));
    expect(getBoardMonthKeyForWeek(weekKey)).toBe('2026-04');
  });

  it('indexes board weeks consistently inside a month', () => {
    const weeks = getBoardWeeksForMonth('2026-05');
    expect(weeks.length).toBeGreaterThan(0);
    expect(getWeekIndexForMonth(weeks[0]!.weekKey, '2026-05')).toBe(1);
  });
});
