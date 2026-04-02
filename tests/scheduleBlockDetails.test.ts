import { describe, expect, it } from 'vitest';
import {
  parseScheduleBlockDetails,
  serializeScheduleBlockDetails
} from '../src/lib/scheduleBlockDetails';

describe('scheduleBlockDetails helpers', () => {
  it('parses plain notes as incomplete blocks', () => {
    expect(parseScheduleBlockDetails('Follow up with client')).toEqual({
      notes: 'Follow up with client',
      completed: false,
      linkedTaskId: null,
      linkedTaskType: null,
      linkedInstanceKey: null
    });
  });

  it('serializes and parses completed schedule metadata', () => {
    const serialized = serializeScheduleBlockDetails(
      'Finish report',
      true,
      'task-1',
      'weekly',
      'weekly:task-1:2026-W14'
    );

    expect(parseScheduleBlockDetails(serialized)).toEqual({
      notes: 'Finish report',
      completed: true,
      linkedTaskId: 'task-1',
      linkedTaskType: 'weekly',
      linkedInstanceKey: 'weekly:task-1:2026-W14'
    });
  });

  it('drops metadata for incomplete blocks', () => {
    expect(serializeScheduleBlockDetails('Normal note', false)).toBe('Normal note');
  });
});
