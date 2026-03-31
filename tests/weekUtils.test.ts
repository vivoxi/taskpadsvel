import { describe, it, expect } from 'vitest';
import {
  getWeekKey,
  getMonthKey,
  getWeekDays,
  weekLabel,
  monthLabel,
  DAY_NAMES
} from '../src/lib/weekUtils';

describe('getWeekKey', () => {
  it('returns ISO week key for a known date', () => {
    // Apr 7, 2025 is ISO week 15 of 2025
    expect(getWeekKey(new Date(2025, 3, 7))).toBe('2025-W15');
  });

  it('pads single-digit weeks with zero', () => {
    // Jan 6, 2025 is ISO week 2 of 2025
    expect(getWeekKey(new Date(2025, 0, 6))).toBe('2025-W02');
  });
});

describe('getMonthKey', () => {
  it('returns month key with zero-padded month', () => {
    expect(getMonthKey(new Date(2025, 3, 1))).toBe('2025-M04');
  });

  it('returns correct key for December', () => {
    expect(getMonthKey(new Date(2025, 11, 1))).toBe('2025-M12');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Monday', () => {
    const days = getWeekDays('2025-W15');
    expect(days).toHaveLength(7);
    // 2025-W15 Monday = Apr 7, 2025
    expect(days[0].getFullYear()).toBe(2025);
    expect(days[0].getMonth()).toBe(3); // April (0-indexed)
    expect(days[0].getDate()).toBe(7);
    // Sunday = Apr 13
    expect(days[6].getDate()).toBe(13);
  });
});

describe('weekLabel', () => {
  it('formats same-month range', () => {
    // W15 2025: Apr 7–13, 2025
    expect(weekLabel('2025-W15')).toBe('Apr 7–13, 2025');
  });

  it('formats cross-month range', () => {
    // W18 2025: Apr 28 – May 4, 2025
    expect(weekLabel('2025-W18')).toBe('Apr 28–May 4, 2025');
  });
});

describe('monthLabel', () => {
  it('returns full month name and year', () => {
    expect(monthLabel('2025-M04')).toBe('April 2025');
  });
});

describe('DAY_NAMES', () => {
  it('has 7 entries starting with Monday', () => {
    expect(DAY_NAMES).toHaveLength(7);
    expect(DAY_NAMES[0]).toBe('Monday');
    expect(DAY_NAMES[6]).toBe('Sunday');
  });
});
