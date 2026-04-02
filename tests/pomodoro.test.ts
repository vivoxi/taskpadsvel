import { describe, expect, it } from 'vitest';
import {
  appendPomodoroHistory,
  createDefaultPomodoroSnapshot,
  formatPomodoroTime,
  getPomodoroDayKey,
  getPomodoroModeLabel,
  getPomodoroNextMode,
  parsePersistedPomodoroState,
  parsePomodoroHistory,
  parsePomodoroSnapshot,
  POMODORO_HISTORY_LIMIT
} from '../src/lib/pomodoro';

describe('pomodoro helpers', () => {
  it('formats seconds into mm:ss', () => {
    expect(formatPomodoroTime(1500)).toBe('25:00');
    expect(formatPomodoroTime(61)).toBe('01:01');
    expect(formatPomodoroTime(0)).toBe('00:00');
  });

  it('picks long break every fourth focus block', () => {
    expect(getPomodoroNextMode('focus', 1)).toBe('short');
    expect(getPomodoroNextMode('focus', 4)).toBe('long');
    expect(getPomodoroNextMode('short', 2)).toBe('focus');
  });

  it('creates stable daily keys', () => {
    expect(getPomodoroDayKey(new Date('2026-04-02T10:15:00.000Z'))).toBe('2026-04-02');
  });

  it('returns readable mode labels', () => {
    expect(getPomodoroModeLabel('focus')).toBe('Focus Sprint');
    expect(getPomodoroModeLabel('short')).toBe('Short Reset');
    expect(getPomodoroModeLabel('long')).toBe('Long Reset');
  });

  it('keeps pomodoro history capped', () => {
    const next = appendPomodoroHistory(
      Array.from({ length: POMODORO_HISTORY_LIMIT }, (_, index) => ({
        id: `old-${index}`,
        mode: 'focus' as const,
        label: '',
        completedAt: `2026-04-02T10:${String(index).padStart(2, '0')}:00.000Z`,
        durationSeconds: 1500
      })),
      {
        id: 'new',
        mode: 'short',
        label: 'Break',
        completedAt: '2026-04-02T12:00:00.000Z',
        durationSeconds: 300
      }
    );

    expect(next).toHaveLength(POMODORO_HISTORY_LIMIT);
    expect(next[0]?.id).toBe('new');
  });

  it('parses saved pomodoro snapshot safely', () => {
    expect(
      parsePomodoroSnapshot(
        JSON.stringify({
          mode: 'long',
          remainingSeconds: 600,
          isRunning: true,
          targetEpochMs: 123456,
          focusLabel: 'Review',
          completedFocusCount: 4,
          completedFocusToday: 2,
          completedBreakToday: 1,
          focusMinutesToday: 50,
          dayKey: '2026-04-02'
        })
      )
    ).toEqual({
      mode: 'long',
      remainingSeconds: 600,
      isRunning: true,
      targetEpochMs: 123456,
      focusLabel: 'Review',
      completedFocusCount: 4,
      completedFocusToday: 2,
      completedBreakToday: 1,
      focusMinutesToday: 50,
      dayKey: '2026-04-02'
    });
  });

  it('falls back to defaults for invalid pomodoro snapshot', () => {
    expect(parsePomodoroSnapshot('{"mode":"weird"}')).toEqual(createDefaultPomodoroSnapshot());
  });

  it('parses pomodoro history safely', () => {
    expect(
      parsePomodoroHistory(
        JSON.stringify([
          {
            id: '1',
            mode: 'focus',
            label: 'Write',
            completedAt: '2026-04-02T10:00:00.000Z',
            durationSeconds: 1500
          },
          {
            id: '2',
            mode: 'oops',
            label: 123,
            completedAt: null,
            durationSeconds: 'bad'
          }
        ])
      )
    ).toEqual([
      {
        id: '1',
        mode: 'focus',
        label: 'Write',
        completedAt: '2026-04-02T10:00:00.000Z',
        durationSeconds: 1500
      },
      {
        id: '2',
        mode: 'focus',
        label: '',
        completedAt: '1970-01-01T00:00:00.000Z',
        durationSeconds: 0
      }
    ]);
  });

  it('parses wrapped persisted pomodoro state safely', () => {
    expect(
      parsePersistedPomodoroState({
        snapshot: {
          mode: 'short',
          remainingSeconds: 240,
          isRunning: false,
          targetEpochMs: null,
          focusLabel: 'Inbox',
          completedFocusCount: 3,
          completedFocusToday: 2,
          completedBreakToday: 2,
          focusMinutesToday: 50,
          dayKey: '2026-04-02'
        },
        history: [
          {
            id: 'h1',
            mode: 'focus',
            label: 'Inbox',
            completedAt: '2026-04-02T10:00:00.000Z',
            durationSeconds: 1500
          }
        ],
        updatedAt: '2026-04-02T11:00:00.000Z'
      })
    ).toEqual({
      snapshot: {
        mode: 'short',
        remainingSeconds: 240,
        isRunning: false,
        targetEpochMs: null,
        focusLabel: 'Inbox',
        completedFocusCount: 3,
        completedFocusToday: 2,
        completedBreakToday: 2,
        focusMinutesToday: 50,
        dayKey: '2026-04-02'
      },
      history: [
        {
          id: 'h1',
          mode: 'focus',
          label: 'Inbox',
          completedAt: '2026-04-02T10:00:00.000Z',
          durationSeconds: 1500
        }
      ],
      updatedAt: '2026-04-02T11:00:00.000Z'
    });
  });
});
