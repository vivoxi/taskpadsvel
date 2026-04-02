<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    Bell,
    BellOff,
    CirclePause,
    Play,
    RotateCcw,
    SkipForward,
    Sparkles,
    TimerReset
  } from 'lucide-svelte';
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
    POMODORO_HISTORY_LIMIT,
    POMODORO_HISTORY_STORAGE_KEY,
    type PomodoroHistoryEntry,
    POMODORO_PRESETS,
    POMODORO_STORAGE_KEY,
    POMODORO_SUPABASE_KEY,
    type PomodoroMode,
    type PomodoroSnapshot
  } from '$lib/pomodoro';
  import { supabase } from '$lib/supabase';
  const MODE_LABELS: Record<PomodoroMode, string> = {
    focus: 'Focus Sprint',
    short: 'Short Reset',
    long: 'Long Reset'
  };
  const MODE_BADGES: Record<PomodoroMode, string> = {
    focus:
      'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300',
    short:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    long:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300'
  };
  const MODE_PANEL: Record<PomodoroMode, string> = {
    focus:
      'border-orange-200/80 bg-orange-50/80 dark:border-orange-500/20 dark:bg-orange-950/16',
    short:
      'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-950/16',
    long:
      'border-sky-200/80 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-950/16'
  };

  let mode = $state<PomodoroMode>('focus');
  let remainingSeconds = $state(POMODORO_PRESETS.focus);
  let isRunning = $state(false);
  let targetEpochMs = $state<number | null>(null);
  let focusLabel = $state('');
  let completedFocusCount = $state(0);
  let completedFocusToday = $state(0);
  let completedBreakToday = $state(0);
  let focusMinutesToday = $state(0);
  let mounted = $state(false);
  let history = $state<PomodoroHistoryEntry[]>([]);
  let notificationPermission = $state<NotificationPermission | 'unsupported'>('default');
  let syncState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let remoteReady = $state(false);
  let hasLocalInteraction = $state(false);

  const currentPreset = $derived(POMODORO_PRESETS[mode]);
  const completionRatio = $derived(
    currentPreset > 0 ? ((currentPreset - remainingSeconds) / currentPreset) * 100 : 0
  );
  const dayKey = $derived(getPomodoroDayKey());
  const sessionHeadline = $derived(
    mode === 'focus'
      ? 'Single-task mode. Close loops, then let the timer push the pace.'
      : mode === 'short'
        ? 'Quick reset. Stand up, breathe, and come back before momentum cools.'
        : 'Long reset. Clear your head before the next deep block.'
  );
  const nextTransitionLabel = $derived(
    mode === 'focus'
      ? getPomodoroNextMode('focus', completedFocusCount + 1) === 'long'
        ? 'Next stop: long reset'
        : 'Next stop: short reset'
      : 'Next stop: focus sprint'
  );
  const latestHistory = $derived(history.slice(0, 8));
  const syncLabel = $derived(
    syncState === 'error' ? 'Sync error' : 'Cloud backup on'
  );

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let remoteSyncTimer: ReturnType<typeof setTimeout> | null = null;

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

  function buildSnapshot(): PomodoroSnapshot {
    return {
      mode,
      remainingSeconds,
      isRunning,
      targetEpochMs,
      focusLabel,
      completedFocusCount,
      completedFocusToday,
      completedBreakToday,
      focusMinutesToday,
      dayKey: getPomodoroDayKey()
    };
  }

  function buildHistoryPayload(): PomodoroHistoryEntry[] {
    return history.map((entry) => ({
      ...entry
    }));
  }

  function persistState() {
    if (!browser || !mounted) return;

    localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(buildSnapshot()));
  }

  function persistHistory() {
    if (!browser || !mounted) return;
    localStorage.setItem(POMODORO_HISTORY_STORAGE_KEY, JSON.stringify(buildHistoryPayload()));
  }

  function scheduleRemoteSync(delay = 400) {
    if (!browser || !mounted || !remoteReady) return;

    const payload = {
      snapshot: buildSnapshot(),
      history: buildHistoryPayload()
    };
    const updatedAt = new Date().toISOString();
    syncState = 'saving';

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

      if (error) {
        syncState = 'error';
        console.error('Failed to sync pomodoro', error);
        return;
      }

      syncState = 'saved';
    }, delay);
  }

  function stopTicker() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function tickTimer() {
    if (!isRunning || targetEpochMs === null) return;

    const nextRemaining = Math.max(0, Math.ceil((targetEpochMs - Date.now()) / 1000));
    remainingSeconds = nextRemaining;

    if (nextRemaining === 0) {
      completeSession();
    }
  }

  function startTicker() {
    stopTicker();
    if (!browser) return;
    intervalId = setInterval(tickTimer, 250);
  }

  function applySnapshot(snapshot: PomodoroSnapshot) {
    const normalized = resetDailyStatsIfNeeded(snapshot);
    mode = normalized.mode;
    focusLabel = normalized.focusLabel;
    completedFocusCount = normalized.completedFocusCount;
    completedFocusToday = normalized.completedFocusToday;
    completedBreakToday = normalized.completedBreakToday;
    focusMinutesToday = normalized.focusMinutesToday;

    if (normalized.isRunning && normalized.targetEpochMs) {
      targetEpochMs = normalized.targetEpochMs;
      isRunning = true;
      remainingSeconds = Math.max(0, Math.ceil((normalized.targetEpochMs - Date.now()) / 1000));
      if (remainingSeconds === 0) {
        completeSession();
      }
      return;
    }

    isRunning = false;
    targetEpochMs = null;
    remainingSeconds = normalized.remainingSeconds;
  }

  function switchMode(nextMode: PomodoroMode) {
    hasLocalInteraction = true;
    mode = nextMode;
    isRunning = false;
    targetEpochMs = null;
    remainingSeconds = POMODORO_PRESETS[nextMode];
    stopTicker();
    persistState();
    scheduleRemoteSync();
  }

  async function enableNotifications() {
    if (!browser || typeof Notification === 'undefined') {
      notificationPermission = 'unsupported';
      return;
    }

    const permission = await Notification.requestPermission();
    notificationPermission = permission;
  }

  function sendNotification(completedMode: PomodoroMode, nextMode: PomodoroMode) {
    if (!browser || typeof Notification === 'undefined') return;
    if (notificationPermission !== 'granted') return;

    const completedLabel = getPomodoroModeLabel(completedMode);
    const nextLabel = getPomodoroModeLabel(nextMode);
    const body =
      completedMode === 'focus'
        ? `${completedLabel} bitti. Sirada ${nextLabel.toLocaleLowerCase('tr-TR')} var.`
        : `${completedLabel} bitti. Tekrar odak zamanina don.`;

    new Notification('Taskpad Pomodoro', { body });
  }

  function handleFocusLabelInput(event: Event) {
    hasLocalInteraction = true;
    focusLabel = (event.currentTarget as HTMLInputElement).value;
  }

  function startSession() {
    if (isRunning) return;
    hasLocalInteraction = true;
    isRunning = true;
    targetEpochMs = Date.now() + remainingSeconds * 1000;
    startTicker();
    persistState();
    scheduleRemoteSync();
  }

  function pauseSession() {
    if (!isRunning) return;
    hasLocalInteraction = true;
    tickTimer();
    isRunning = false;
    targetEpochMs = null;
    stopTicker();
    persistState();
    scheduleRemoteSync();
  }

  function resetSession() {
    hasLocalInteraction = true;
    isRunning = false;
    targetEpochMs = null;
    remainingSeconds = currentPreset;
    stopTicker();
    persistState();
    scheduleRemoteSync();
  }

  function completeSession() {
    hasLocalInteraction = true;
    stopTicker();
    isRunning = false;
    targetEpochMs = null;
    const completedMode = mode;
    const durationSeconds = POMODORO_PRESETS[completedMode];
    const historyEntry: PomodoroHistoryEntry = {
      id: `${Date.now()}-${completedMode}`,
      mode: completedMode,
      label: focusLabel.trim(),
      completedAt: new Date().toISOString(),
      durationSeconds
    };

    if (completedMode === 'focus') {
      const nextFocusCount = completedFocusCount + 1;
      completedFocusCount = nextFocusCount;
      completedFocusToday += 1;
      focusMinutesToday += Math.round(POMODORO_PRESETS.focus / 60);
      mode = getPomodoroNextMode('focus', nextFocusCount);
    } else {
      completedBreakToday += 1;
      mode = 'focus';
    }

    history = appendPomodoroHistory(history, historyEntry);
    remainingSeconds = POMODORO_PRESETS[mode];
    sendNotification(completedMode, mode);
    persistState();
    persistHistory();
    scheduleRemoteSync();
  }

  function skipSession() {
    completeSession();
  }

  onMount(() => {
    mounted = true;

    try {
      applySnapshot(parsePomodoroSnapshot(localStorage.getItem(POMODORO_STORAGE_KEY)));
    } catch {
      // Ignore invalid local state and keep defaults.
      applySnapshot(createDefaultPomodoroSnapshot());
    }

    try {
      history = parsePomodoroHistory(localStorage.getItem(POMODORO_HISTORY_STORAGE_KEY));
    } catch {
      history = [];
    }

    if (typeof Notification === 'undefined') {
      notificationPermission = 'unsupported';
    } else {
      notificationPermission = Notification.permission;
    }

    if (isRunning) {
      startTicker();
    }

    void (async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', POMODORO_SUPABASE_KEY)
        .maybeSingle();

      if (error) {
        syncState = 'error';
        remoteReady = true;
        console.error('Failed to load pomodoro sync state', error);
        return;
      }

      const persisted = parsePersistedPomodoroState(data?.value);
      if (persisted && !hasLocalInteraction) {
        stopTicker();
        applySnapshot(persisted.snapshot);
        history = persisted.history;
        syncState = persisted.updatedAt ? 'saved' : 'idle';
        if (isRunning) startTicker();
      }

      remoteReady = true;
    })();

    persistState();
    persistHistory();

    return () => {
      stopTicker();
      if (remoteSyncTimer) clearTimeout(remoteSyncTimer);
    };
  });

  $effect(() => {
    if (!mounted) return;
    persistState();
    persistHistory();
  });

  $effect(() => {
    if (!mounted || !remoteReady) return;
    focusLabel;
    scheduleRemoteSync(500);
  });
</script>

<svelte:head>
  <title>Pomodoro — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <section class="rounded-[28px] border border-zinc-200 bg-red-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-red-950/12">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-700 dark:border-red-500/20 dark:bg-white/6 dark:text-red-300">
            <Sparkles size={12} />
            Focus Console
          </div>
          <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
            Pomodoro takip sayfasi
          </h1>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Tek isi one al, sprinti baslat, mola ritmini bozma. Sayaç cihazda korunur ve arka planda buluta da senkronlanir.
          </p>
        </div>

        <div class="rounded-[24px] border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-950/50">
          <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Today</div>
          <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {focusMinutesToday} dk
          </div>
          <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {completedFocusToday} focus / {completedBreakToday} mola
          </div>
          <div class="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
            {syncLabel}
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <article class={`rounded-[28px] border px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 ${MODE_PANEL[mode]}`}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${MODE_BADGES[mode]}`}>
            {MODE_LABELS[mode]}
          </div>
          <div class="text-sm text-zinc-500 dark:text-zinc-400">
            {nextTransitionLabel}
          </div>
        </div>

        <div class="mt-8 flex flex-col items-center text-center">
          <div class="relative flex h-64 w-full max-w-[24rem] items-center justify-center overflow-hidden rounded-[30px] border border-white/50 bg-white/65 dark:border-white/5 dark:bg-black/15">
            <div class="absolute inset-x-6 top-6 h-2 overflow-hidden rounded-full bg-white/75 dark:bg-white/8">
              <div
                class="h-full rounded-full bg-orange-500 transition-all duration-300 dark:bg-orange-400"
                style={`width: ${Math.max(0, Math.min(100, completionRatio))}%`}
              ></div>
            </div>

            <div class="flex flex-col items-center gap-3">
              <div class="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Session Timer</div>
              <div class="font-mono text-6xl font-semibold tracking-tight text-zinc-950 sm:text-7xl dark:text-zinc-50">
                {formatPomodoroTime(remainingSeconds)}
              </div>
              <div class="max-w-[18rem] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                {sessionHeadline}
              </div>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onclick={() => switchMode('focus')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${mode === 'focus' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Focus 25m
            </button>
            <button
              onclick={() => switchMode('short')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${mode === 'short' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Short 5m
            </button>
            <button
              onclick={() => switchMode('long')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${mode === 'long' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Long 15m
            </button>
          </div>

          <div class="mt-6 flex flex-wrap justify-center gap-3">
            {#if isRunning}
              <button
                onclick={pauseSession}
                class="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                <CirclePause size={16} />
                Pause
              </button>
            {:else}
              <button
                onclick={startSession}
                class="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                <Play size={16} />
                Start
              </button>
            {/if}

            <button
              onclick={resetSession}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-5 py-3 text-sm text-zinc-700 transition-colors hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <RotateCcw size={16} />
              Reset
            </button>

            <button
              onclick={skipSession}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-5 py-3 text-sm text-zinc-700 transition-colors hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <SkipForward size={16} />
              Skip
            </button>
          </div>
        </div>
      </article>

      <div class="flex flex-col gap-5">
        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <TimerReset size={16} />
            Current Focus
          </div>
          <input
            type="text"
            value={focusLabel}
            oninput={handleFocusLabelInput}
            placeholder="Su an odaklandigin isi yaz..."
            class="mt-4 w-full rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:focus:border-zinc-500"
          />
          <div class="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-400">
            {focusLabel.trim() || 'No target selected'}
          </div>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Notifications</div>
            <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">
              {notificationPermission === 'granted'
                ? 'Enabled'
                : notificationPermission === 'unsupported'
                  ? 'Unsupported'
                  : 'Off'}
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button
              onclick={enableNotifications}
              disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {#if notificationPermission === 'granted'}
                <Bell size={15} />
              {:else}
                <BellOff size={15} />
              {/if}
              Bildirimleri ac
            </button>
            <p class="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Session bittiginde tarayici sana focus veya mola gecisini haber verir.
            </p>
          </div>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Rhythm Snapshot</div>
          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <div class="rounded-[20px] border border-orange-200/80 bg-orange-50/80 p-4 dark:border-orange-500/20 dark:bg-orange-950/18">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Focus Count</div>
              <div class="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{completedFocusCount}</div>
            </div>
            <div class="rounded-[20px] border border-emerald-200/80 bg-emerald-50/80 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/18">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Break Count</div>
              <div class="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{completedBreakToday}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Today Key</div>
              <div class="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{dayKey}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Next Break</div>
              <div class="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {completedFocusCount % 4 === 3 ? 'Long' : 'Short'}
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">How This Works</div>
          <ul class="mt-4 space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            <li>Timer local olarak tarayicida saklanir; deploy veya DB gerektirmez.</li>
            <li>Focus bitince otomatik mola moduna, mola bitince tekrar focus moduna gecer.</li>
            <li>Her 4 focus sprintten sonra siradaki mola uzun mola olur.</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Pomodoro Gecmisi</div>
          <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
            Son {Math.min(POMODORO_HISTORY_LIMIT, latestHistory.length)} session
          </div>
        </div>
      </div>

      {#if latestHistory.length === 0}
        <div class="mt-5 rounded-[20px] border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-400 dark:border-zinc-700">
          Henuz tamamlanmis pomodoro yok.
        </div>
      {:else}
        <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {#each latestHistory as entry (entry.id)}
            <article class="rounded-[22px] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="flex items-center justify-between gap-2">
                <div class={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${MODE_BADGES[entry.mode]}`}>
                  {getPomodoroModeLabel(entry.mode)}
                </div>
                <div class="text-xs text-zinc-400">
                  {formatPomodoroTime(entry.durationSeconds)}
                </div>
              </div>
              <div class="mt-3 line-clamp-2 min-h-[2.75rem] text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {entry.label || 'Untitled session'}
              </div>
              <div class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(entry.completedAt).toLocaleString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
