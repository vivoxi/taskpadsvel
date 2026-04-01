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
      linkedTaskType: null
    });
  });

  it('serializes and parses completed schedule metadata', () => {
    const serialized = serializeScheduleBlockDetails('Finish report', true, 'task-1', 'weekly');

    expect(parseScheduleBlockDetails(serialized)).toEqual({
      notes: 'Finish report',
      completed: true,
      linkedTaskId: 'task-1',
      linkedTaskType: 'weekly'
    });
  });

  it('drops metadata for incomplete blocks', () => {
    expect(serializeScheduleBlockDetails('Normal note', false)).toBe('Normal note');
  });
});
