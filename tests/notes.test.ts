import { describe, expect, it } from 'vitest';
import {
  createDefaultNotesState,
  parseNotesState,
  parsePersistedNotesState
} from '../src/lib/notes';

describe('notes helpers', () => {
  it('returns default state when storage is empty', () => {
    expect(parseNotesState(null)).toEqual(createDefaultNotesState());
  });

  it('parses saved note state safely', () => {
    expect(
      parseNotesState(
        JSON.stringify({
          workspace: 'master',
          today: 'today',
          next: 'next',
          parkingLot: 'later',
          bullets: ['a', 'b', 3]
        })
      )
    ).toEqual({
      workspace: 'master',
      today: 'today',
      next: 'next',
      parkingLot: 'later',
      bullets: ['a', 'b']
    });
  });

  it('parses wrapped persisted note state safely', () => {
    expect(
      parsePersistedNotesState({
        state: {
          workspace: 'remote',
          today: 'today',
          next: 'next',
          parkingLot: 'later',
          bullets: ['one', 2, 'three']
        },
        updatedAt: '2026-04-02T10:00:00.000Z'
      })
    ).toEqual({
      state: {
        workspace: 'remote',
        today: 'today',
        next: 'next',
        parkingLot: 'later',
        bullets: ['one', 'three']
      },
      updatedAt: '2026-04-02T10:00:00.000Z'
    });
  });
});
