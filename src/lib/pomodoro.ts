export type PomodoroMode = 'focus' | 'short' | 'long';
export type PomodoroHistoryEntry = {
  id: string;
  mode: PomodoroMode;
  label: string;
  completedAt: string;
  durationSeconds: number;
};

export type PomodoroSnapshot = {
  mode: PomodoroMode;
  remainingSeconds: number;
  isRunning: boolean;
  targetEpochMs: number | null;
  focusLabel: string;
  completedFocusCount: number;
  completedFocusToday: number;
  completedBreakToday: number;
  focusMinutesToday: number;
  dayKey: string;
};

export type PersistedPomodoroState = {
  snapshot: PomodoroSnapshot;
  history: PomodoroHistoryEntry[];
  updatedAt: string | null;
};

export const POMODORO_PRESETS: Record<PomodoroMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};
export const POMODORO_HISTORY_RETENTION_DAYS = 31;
export const POMODORO_HISTORY_LIMIT = 1000;
export const POMODORO_STORAGE_KEY = 'taskpad:pomodoro:v1';
export const POMODORO_HISTORY_STORAGE_KEY = 'taskpad:pomodoro-history:v1';
export const POMODORO_SUPABASE_KEY = 'pomodoro:v1';

export function formatPomodoroTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(clamped / 60)).padStart(2, '0');
  const seconds = String(clamped % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function getPomodoroNextMode(mode: PomodoroMode, nextFocusCount: number): PomodoroMode {
  if (mode === 'focus') {
    return nextFocusCount % 4 === 0 ? 'long' : 'short';
  }

  return 'focus';
}

export function getPomodoroDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getPomodoroModeLabel(mode: PomodoroMode): string {
  if (mode === 'focus') return 'Focus Sprint';
  if (mode === 'short') return 'Short Reset';
  return 'Long Reset';
}

export function appendPomodoroHistory(
  history: PomodoroHistoryEntry[],
  entry: PomodoroHistoryEntry,
  nowMs = Date.now()
): PomodoroHistoryEntry[] {
  return prunePomodoroHistory([entry, ...history], nowMs);
}

export function createDefaultPomodoroSnapshot(): PomodoroSnapshot {
  return {
    mode: 'focus',
    remainingSeconds: POMODORO_PRESETS.focus,
    isRunning: false,
    targetEpochMs: null,
    focusLabel: '',
    completedFocusCount: 0,
    completedFocusToday: 0,
    completedBreakToday: 0,
    focusMinutesToday: 0,
    dayKey: getPomodoroDayKey()
  };
}

function normalizePomodoroMode(value: unknown): PomodoroMode {
  return value === 'short' || value === 'long' ? value : 'focus';
}

function normalizePomodoroHistoryEntry(value: unknown): PomodoroHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  return {
    id: typeof parsed.id === 'string' ? parsed.id : `${Date.now()}-${normalizePomodoroMode(parsed.mode)}`,
    mode: normalizePomodoroMode(parsed.mode),
    label: typeof parsed.label === 'string' ? parsed.label : '',
    completedAt:
      typeof parsed.completedAt === 'string' ? parsed.completedAt : new Date(0).toISOString(),
    durationSeconds:
      typeof parsed.durationSeconds === 'number' && Number.isFinite(parsed.durationSeconds)
        ? Math.max(0, Math.floor(parsed.durationSeconds))
        : 0
  };
}

function normalizePomodoroSnapshot(value: unknown): PomodoroSnapshot {
  const parsed = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const mode = normalizePomodoroMode(parsed.mode);

  return {
    mode,
    remainingSeconds:
      typeof parsed.remainingSeconds === 'number' && Number.isFinite(parsed.remainingSeconds)
        ? Math.max(0, Math.floor(parsed.remainingSeconds))
        : POMODORO_PRESETS[mode],
    isRunning: Boolean(parsed.isRunning),
    targetEpochMs:
      typeof parsed.targetEpochMs === 'number' && Number.isFinite(parsed.targetEpochMs)
        ? parsed.targetEpochMs
        : null,
    focusLabel: typeof parsed.focusLabel === 'string' ? parsed.focusLabel : '',
    completedFocusCount:
      typeof parsed.completedFocusCount === 'number' && Number.isFinite(parsed.completedFocusCount)
        ? Math.max(0, Math.floor(parsed.completedFocusCount))
        : 0,
    completedFocusToday:
      typeof parsed.completedFocusToday === 'number' && Number.isFinite(parsed.completedFocusToday)
        ? Math.max(0, Math.floor(parsed.completedFocusToday))
        : 0,
    completedBreakToday:
      typeof parsed.completedBreakToday === 'number' && Number.isFinite(parsed.completedBreakToday)
        ? Math.max(0, Math.floor(parsed.completedBreakToday))
        : 0,
    focusMinutesToday:
      typeof parsed.focusMinutesToday === 'number' && Number.isFinite(parsed.focusMinutesToday)
        ? Math.max(0, Math.floor(parsed.focusMinutesToday))
        : 0,
    dayKey: typeof parsed.dayKey === 'string' ? parsed.dayKey : getPomodoroDayKey()
  };
}

function prunePomodoroHistory(
  history: PomodoroHistoryEntry[],
  nowMs = Date.now()
): PomodoroHistoryEntry[] {
  const cutoffMs = nowMs - POMODORO_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return history
    .filter((entry) => {
      const completedAtMs = Date.parse(entry.completedAt);
      return Number.isFinite(completedAtMs) && completedAtMs >= cutoffMs;
    })
    .slice(0, POMODORO_HISTORY_LIMIT);
}

export function parsePomodoroSnapshot(raw: string | null | undefined): PomodoroSnapshot {
  if (!raw) return createDefaultPomodoroSnapshot();

  try {
    return normalizePomodoroSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultPomodoroSnapshot();
  }
}

export function parsePomodoroHistory(
  raw: string | null | undefined,
  nowMs = Date.now()
): PomodoroHistoryEntry[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return prunePomodoroHistory(
      parsed
      .map(normalizePomodoroHistoryEntry)
        .filter((entry): entry is PomodoroHistoryEntry => entry !== null),
      nowMs
    );
  } catch {
    return [];
  }
}

export function parsePersistedPomodoroState(
  value: unknown,
  nowMs = Date.now()
): PersistedPomodoroState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  const snapshotSource =
    parsed.snapshot && typeof parsed.snapshot === 'object' && !Array.isArray(parsed.snapshot)
      ? parsed.snapshot
      : parsed;
  const historySource = Array.isArray(parsed.history) ? parsed.history : [];

  return {
    snapshot: normalizePomodoroSnapshot(snapshotSource),
    history: prunePomodoroHistory(
      historySource
        .map(normalizePomodoroHistoryEntry)
        .filter((entry): entry is PomodoroHistoryEntry => entry !== null),
      nowMs
    ),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
  };
}
