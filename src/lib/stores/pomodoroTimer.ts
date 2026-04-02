import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import {
  appendPomodoroHistory,
  createDefaultPomodoroSnapshot,
  getPomodoroDayKey,
  getPomodoroModeLabel,
  getPomodoroNextMode,
  parsePersistedPomodoroState,
  parsePomodoroHistory,
  parsePomodoroSnapshot,
  POMODORO_HISTORY_STORAGE_KEY,
  POMODORO_PRESETS,
  POMODORO_STORAGE_KEY,
  POMODORO_SUPABASE_KEY,
  type PomodoroHistoryEntry,
  type PomodoroMode,
  type PomodoroSnapshot
} from '$lib/pomodoro';
import { supabase } from '$lib/supabase';

export type PomodoroSyncState = 'idle' | 'saving' | 'saved' | 'error';

export type PomodoroTimerState = PomodoroSnapshot & {
  history: PomodoroHistoryEntry[];
  notificationPermission: NotificationPermission | 'unsupported';
  syncState: PomodoroSyncState;
  mounted: boolean;
  remoteReady: boolean;
};

const DEFAULT_TIMER_STATE: PomodoroTimerState = {
  ...createDefaultPomodoroSnapshot(),
  history: [],
  notificationPermission: 'default',
  syncState: 'idle',
  mounted: false,
  remoteReady: false
};

const pomodoroTimerState = writable<PomodoroTimerState>(DEFAULT_TIMER_STATE);

let intervalId: ReturnType<typeof setInterval> | null = null;
let remoteSyncTimer: ReturnType<typeof setTimeout> | null = null;
let hasLocalInteraction = false;
let initialized = false;

function resetDailyStatsIfNeeded(snapshot: PomodoroSnapshot): PomodoroSnapshot {
  const todayKey = getPomodoroDayKey();
  if (snapshot.dayKey === todayKey) return snapshot;

  return {
    ...snapshot,
    dayKey: todayKey,
    completedFocusToday: 0,
    completedBreakToday: 0,
    focusMinutesToday: 0
  };
}

function persistLocalState(state: PomodoroTimerState) {
  if (!browser || !state.mounted) return;

  const snapshot: PomodoroSnapshot = {
    mode: state.mode,
    remainingSeconds: state.remainingSeconds,
    isRunning: state.isRunning,
    targetEpochMs: state.targetEpochMs,
    focusLabel: state.focusLabel,
    completedFocusCount: state.completedFocusCount,
    completedFocusToday: state.completedFocusToday,
    completedBreakToday: state.completedBreakToday,
    focusMinutesToday: state.focusMinutesToday,
    dayKey: state.dayKey
  };

  localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(POMODORO_HISTORY_STORAGE_KEY, JSON.stringify(state.history));
}

function stopTicker() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}

function scheduleRemoteSync(delay = 400) {
  if (!browser) return;
  const state = get(pomodoroTimerState);
  if (!state.mounted || !state.remoteReady) return;

  const payload = {
    snapshot: {
      mode: state.mode,
      remainingSeconds: state.remainingSeconds,
      isRunning: state.isRunning,
      targetEpochMs: state.targetEpochMs,
      focusLabel: state.focusLabel,
      completedFocusCount: state.completedFocusCount,
      completedFocusToday: state.completedFocusToday,
      completedBreakToday: state.completedBreakToday,
      focusMinutesToday: state.focusMinutesToday,
      dayKey: state.dayKey
    },
    history: state.history.map((entry) => ({ ...entry }))
  };
  const updatedAt = new Date().toISOString();

  pomodoroTimerState.update((current) => ({ ...current, syncState: 'saving' }));

  if (remoteSyncTimer) clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(async () => {
    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: POMODORO_SUPABASE_KEY,
        value: {
          ...payload,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    pomodoroTimerState.update((current) => ({
      ...current,
      syncState: error ? 'error' : 'saved'
    }));

    if (error) {
      console.error('Failed to sync pomodoro', error);
    }
  }, delay);
}

function updateTimerState(
  updater: (state: PomodoroTimerState) => PomodoroTimerState,
  options: { localInteraction?: boolean; remoteSyncDelay?: number | null } = {}
) {
  if (options.localInteraction) {
    hasLocalInteraction = true;
  }

  let nextState = DEFAULT_TIMER_STATE;
  pomodoroTimerState.update((state) => {
    nextState = updater(state);
    return nextState;
  });
  persistLocalState(nextState);

  if (options.remoteSyncDelay !== null) {
    scheduleRemoteSync(options.remoteSyncDelay ?? 400);
  }
}

function sendSessionNotification(completedMode: PomodoroMode, nextMode: PomodoroMode) {
  if (!browser || typeof Notification === 'undefined') return;
  if (get(pomodoroTimerState).notificationPermission !== 'granted') return;

  const completedLabel = getPomodoroModeLabel(completedMode);
  const nextLabel = getPomodoroModeLabel(nextMode);
  const body =
    completedMode === 'focus'
      ? `${completedLabel} bitti. Sirada ${nextLabel.toLocaleLowerCase('tr-TR')} var.`
      : `${completedLabel} bitti. Tekrar odak zamanina don.`;

  new Notification('Taskpad Pomodoro', { body });
}

function applySnapshot(snapshot: PomodoroSnapshot, history?: PomodoroHistoryEntry[]) {
  const normalized = resetDailyStatsIfNeeded(snapshot);
  stopTicker();

  updateTimerState(
    (state) => {
      const nextState: PomodoroTimerState = {
        ...state,
        ...normalized,
        history: history ?? state.history
      };

      if (normalized.isRunning && normalized.targetEpochMs) {
        nextState.isRunning = true;
        nextState.targetEpochMs = normalized.targetEpochMs;
        nextState.remainingSeconds = Math.max(
          0,
          Math.ceil((normalized.targetEpochMs - Date.now()) / 1000)
        );
      } else {
        nextState.isRunning = false;
        nextState.targetEpochMs = null;
        nextState.remainingSeconds = normalized.remainingSeconds;
      }

      return nextState;
    },
    { remoteSyncDelay: null }
  );
}

function completeSession() {
  const current = get(pomodoroTimerState);
  const completedMode = current.mode;
  const durationSeconds = POMODORO_PRESETS[completedMode];
  const historyEntry: PomodoroHistoryEntry = {
    id: `${Date.now()}-${completedMode}`,
    mode: completedMode,
    label: current.focusLabel.trim(),
    completedAt: new Date().toISOString(),
    durationSeconds
  };

  const nextMode =
    completedMode === 'focus'
      ? getPomodoroNextMode('focus', current.completedFocusCount + 1)
      : 'focus';

  stopTicker();
  sendSessionNotification(completedMode, nextMode);

  updateTimerState(
    (state) => ({
      ...state,
      mode: nextMode,
      isRunning: false,
      targetEpochMs: null,
      remainingSeconds: POMODORO_PRESETS[nextMode],
      completedFocusCount:
        completedMode === 'focus'
          ? state.completedFocusCount + 1
          : state.completedFocusCount,
      completedFocusToday:
        completedMode === 'focus'
          ? state.completedFocusToday + 1
          : state.completedFocusToday,
      completedBreakToday:
        completedMode === 'focus'
          ? state.completedBreakToday
          : state.completedBreakToday + 1,
      focusMinutesToday:
        completedMode === 'focus'
          ? state.focusMinutesToday + Math.round(POMODORO_PRESETS.focus / 60)
          : state.focusMinutesToday,
      dayKey: getPomodoroDayKey(),
      history: appendPomodoroHistory(state.history, historyEntry)
    }),
    { localInteraction: true }
  );
}

function tickTimer() {
  const current = get(pomodoroTimerState);
  if (!current.isRunning || current.targetEpochMs === null) return;

  const nextRemaining = Math.max(0, Math.ceil((current.targetEpochMs - Date.now()) / 1000));

  pomodoroTimerState.update((state) => ({
    ...state,
    remainingSeconds: nextRemaining
  }));

  const nextState = get(pomodoroTimerState);
  persistLocalState(nextState);

  if (nextRemaining === 0) {
    completeSession();
  }
}

function startTicker() {
  stopTicker();
  if (!browser) return;
  intervalId = setInterval(tickTimer, 250);
}

async function hydrateRemoteState() {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('value')
    .eq('key', POMODORO_SUPABASE_KEY)
    .maybeSingle();

  if (error) {
    pomodoroTimerState.update((state) => ({
      ...state,
      remoteReady: true,
      syncState: 'error'
    }));
    console.error('Failed to load pomodoro sync state', error);
    return;
  }

  const persisted = parsePersistedPomodoroState(data?.value);
  if (persisted && !hasLocalInteraction) {
    applySnapshot(persisted.snapshot, persisted.history);
    pomodoroTimerState.update((state) => ({
      ...state,
      syncState: persisted.updatedAt ? 'saved' : 'idle'
    }));
  }

  pomodoroTimerState.update((state) => ({
    ...state,
    remoteReady: true
  }));

  if (get(pomodoroTimerState).isRunning) {
    startTicker();
  }
}

export function initializePomodoroTimer() {
  if (!browser || initialized) return;
  initialized = true;

  const snapshot = parsePomodoroSnapshot(localStorage.getItem(POMODORO_STORAGE_KEY));
  const history = parsePomodoroHistory(localStorage.getItem(POMODORO_HISTORY_STORAGE_KEY));

  pomodoroTimerState.set({
    ...DEFAULT_TIMER_STATE,
    ...resetDailyStatsIfNeeded(snapshot),
    history,
    mounted: true,
    notificationPermission:
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  });

  if (get(pomodoroTimerState).isRunning) {
    const targetEpochMs = get(pomodoroTimerState).targetEpochMs;
    pomodoroTimerState.update((state) => ({
      ...state,
      remainingSeconds: targetEpochMs
        ? Math.max(0, Math.ceil((targetEpochMs - Date.now()) / 1000))
        : state.remainingSeconds
    }));

    if (get(pomodoroTimerState).remainingSeconds === 0) {
      completeSession();
    } else {
      startTicker();
    }
  }

  persistLocalState(get(pomodoroTimerState));
  void hydrateRemoteState();
}

export const pomodoroTimer = {
  subscribe: pomodoroTimerState.subscribe,
  switchMode(nextMode: PomodoroMode) {
    stopTicker();
    updateTimerState(
      (state) => ({
        ...state,
        mode: nextMode,
        isRunning: false,
        targetEpochMs: null,
        remainingSeconds: POMODORO_PRESETS[nextMode]
      }),
      { localInteraction: true }
    );
  },
  setFocusLabel(label: string) {
    updateTimerState((state) => ({ ...state, focusLabel: label }), {
      localInteraction: true,
      remoteSyncDelay: 500
    });
  },
  startSession() {
    const current = get(pomodoroTimerState);
    if (current.isRunning) return;

    updateTimerState(
      (state) => ({
        ...state,
        isRunning: true,
        targetEpochMs: Date.now() + state.remainingSeconds * 1000
      }),
      { localInteraction: true }
    );
    startTicker();
  },
  pauseSession() {
    const current = get(pomodoroTimerState);
    if (!current.isRunning) return;

    tickTimer();
    stopTicker();

    updateTimerState(
      (state) => ({
        ...state,
        isRunning: false,
        targetEpochMs: null
      }),
      { localInteraction: true }
    );
  },
  resetSession() {
    stopTicker();
    updateTimerState(
      (state) => ({
        ...state,
        isRunning: false,
        targetEpochMs: null,
        remainingSeconds: POMODORO_PRESETS[state.mode]
      }),
      { localInteraction: true }
    );
  },
  skipSession() {
    completeSession();
  },
  async enableNotifications() {
    if (!browser || typeof Notification === 'undefined') {
      pomodoroTimerState.update((state) => ({
        ...state,
        notificationPermission: 'unsupported'
      }));
      return;
    }

    const permission = await Notification.requestPermission();
    pomodoroTimerState.update((state) => ({
      ...state,
      notificationPermission: permission
    }));
  }
};
