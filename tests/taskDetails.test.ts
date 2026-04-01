import { describe, expect, it } from 'vitest';
import {
  parseEstimatedHoursInput,
  parseTaskDetails,
  serializeTaskDetails,
  toSchedulableTask
} from '../src/lib/taskDetails';

describe('taskDetails helpers', () => {
  it('parses plain notes without metadata', () => {
    expect(parseTaskDetails('plain note')).toEqual({
      notes: 'plain note',
      estimatedHours: null,
      preferredWeekOfMonth: null,
      preferredDay: null,
      category: null
    });
  });

  it('serializes and parses estimated hours metadata', () => {
    const serialized = serializeTaskDetails('Deep work session', 2.5);

    expect(parseTaskDetails(serialized)).toEqual({
      notes: 'Deep work session',
      estimatedHours: 2.5,
      preferredWeekOfMonth: null,
      preferredDay: null,
      category: null
    });
  });

  it('serializes and parses monthly scheduling preferences', () => {
    const serialized = serializeTaskDetails('Month-end work', 3, 4, 'Friday');

    expect(parseTaskDetails(serialized)).toEqual({
      notes: 'Month-end work',
      estimatedHours: 3,
      preferredWeekOfMonth: 4,
      preferredDay: 'Friday',
      category: null
    });
  });

  it('supports category metadata for random tasks', () => {
    const serialized = serializeTaskDetails('Track this separately', null, null, null, 'Ramazan C');

    expect(parseTaskDetails(serialized)).toEqual({
      notes: 'Track this separately',
      estimatedHours: null,
      preferredWeekOfMonth: null,
      preferredDay: null,
      category: 'Ramazan C'
    });
  });

  it('treats invalid hour inputs as null', () => {
    expect(parseEstimatedHoursInput('')).toBeNull();
    expect(parseEstimatedHoursInput('abc')).toBeNull();
    expect(parseEstimatedHoursInput('0')).toBeNull();
  });

  it('builds a schedulable task with clean notes and estimated hours', () => {
    const task = toSchedulableTask({
      id: '1',
      title: 'Write report',
      type: 'weekly',
      completed: false,
      notes: serializeTaskDetails('Needs focus time', 3),
      created_at: '2026-01-01T00:00:00.000Z'
    });

    expect(task.estimated_hours).toBe(3);
    expect(task.scheduling_notes).toBe('Needs focus time');
    expect(task.preferred_week_of_month).toBeNull();
    expect(task.preferred_day).toBeNull();
    expect(task.category).toBeNull();
  });

  it('supports preferred day metadata for weekly tasks', () => {
    const task = toSchedulableTask({
      id: '2',
      title: 'Bank reconciliation',
      type: 'weekly',
      completed: false,
      notes: serializeTaskDetails('Do this early in the week', 4, null, 'Monday'),
      created_at: '2026-01-01T00:00:00.000Z'
    });

    expect(task.estimated_hours).toBe(4);
    expect(task.preferred_week_of_month).toBeNull();
    expect(task.preferred_day).toBe('Monday');
    expect(task.category).toBeNull();
  });
});
