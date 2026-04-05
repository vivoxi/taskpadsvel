<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery } from '@tanstack/svelte-query';
  import {
    Archive,
    Bell,
    BellOff,
    CirclePause,
    ClipboardCheck,
    Play,
    RotateCcw,
    SkipForward,
    Sparkles,
    TimerReset
  } from 'lucide-svelte';
  import { apiJson, canUseClientApi } from '$lib/client/api';
  import { Card, EmptyState, PageTitle, SectionHeader } from '$lib/components/ui';
  import {
    getMonthlyInstanceStatusStorageKey,
    getMonthlyInstancesStorageKey,
    getWeeklyInstanceStatusStorageKey,
    getWeeklyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import {
    formatPomodoroTime,
    type PomodoroHistoryEntry,
    getPomodoroDayKey,
    getPomodoroModeLabel,
    getPomodoroNextMode,
    POMODORO_HISTORY_RETENTION_DAYS,
    POMODORO_PRESETS,
    type PomodoroMode
  } from '$lib/pomodoro';
  import { authPassword } from '$lib/stores';
  import { pomodoroTimer } from '$lib/stores/pomodoroTimer';
  import { getBoardMonthKeyForWeek, getBoardWeekOfMonth, getWeekKey } from '$lib/weekUtils';

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

  const completionRatio = $derived(
    POMODORO_PRESETS[$pomodoroTimer.mode] > 0
      ? ((POMODORO_PRESETS[$pomodoroTimer.mode] - $pomodoroTimer.remainingSeconds) /
          POMODORO_PRESETS[$pomodoroTimer.mode]) *
        100
      : 0
  );
  const sessionHeadline = $derived(
    $pomodoroTimer.mode === 'focus'
      ? 'Single-task mode. Close loops, then let the timer push the pace.'
      : $pomodoroTimer.mode === 'short'
        ? 'Quick reset. Stand up, breathe, and come back before momentum cools.'
        : 'Long reset. Clear your head before the next deep block.'
  );
  const nextTransitionLabel = $derived(
    $pomodoroTimer.mode === 'focus'
      ? getPomodoroNextMode('focus', $pomodoroTimer.completedFocusCount + 1) === 'long'
        ? 'Next stop: long reset'
        : 'Next stop: short reset'
      : 'Next stop: focus sprint'
  );
  const latestHistory = $derived($pomodoroTimer.history);
  const syncLabel = $derived(
    $pomodoroTimer.syncState === 'error' ? 'Sync error' : 'Cloud backup on'
  );
  const currentWeekKey = getWeekKey();
  const currentMonthKey = getBoardMonthKeyForWeek(currentWeekKey);
  const currentWeekOfMonth = getBoardWeekOfMonth(currentWeekKey, currentMonthKey);
  const canAccessApi = $derived(canUseClientApi($authPassword));

  const weeklyInstancesQuery = createQuery(() => ({
    queryKey: ['pomodoro', 'period_instances', 'weekly', currentWeekKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getWeeklyInstancesStorageKey(currentWeekKey))}`
      );
      return parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? [];
    },
    enabled: browser && canAccessApi
  }));

  const weeklyStatusQuery = createQuery(() => ({
    queryKey: ['pomodoro', 'period_status', 'weekly', currentWeekKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(
          getWeeklyInstanceStatusStorageKey(currentWeekKey)
        )}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi
  }));

  const monthlyInstancesQuery = createQuery(() => ({
    queryKey: ['pomodoro', 'period_instances', 'monthly', currentMonthKey, currentWeekOfMonth] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getMonthlyInstancesStorageKey(currentMonthKey))}`
      );
      return (parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? []).filter(
        (instance) => instance.preferred_week_of_month === currentWeekOfMonth
      );
    },
    enabled: browser && canAccessApi
  }));

  const monthlyStatusQuery = createQuery(() => ({
    queryKey: ['pomodoro', 'period_status', 'monthly', currentMonthKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(
          getMonthlyInstanceStatusStorageKey(currentMonthKey)
        )}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi
  }));

  type PomodoroTaskOption = {
    id: string;
    title: string;
    source: 'weekly' | 'monthly';
  };

  function buildTaskOptions(
    instances: PersistedPeriodTaskInstance[],
    completedInstanceKeys: string[]
  ): PomodoroTaskOption[] {
    return instances
      .filter((instance) => !completedInstanceKeys.includes(instance.instance_key))
      .map((instance) => ({
        id: instance.instance_key,
        title: instance.title,
        source: instance.period_type
      }));
  }

  const thisWeekTasks = $derived([
    ...buildTaskOptions(
      (weeklyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
      weeklyStatusQuery.data ?? []
    ),
    ...buildTaskOptions(
      (monthlyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
      monthlyStatusQuery.data ?? []
    )
  ]);

  function handleFocusLabelInput(event: Event) {
    pomodoroTimer.setFocusLabel((event.currentTarget as HTMLInputElement).value);
  }

  function handleTaskSelection(event: Event) {
    const nextId = (event.currentTarget as HTMLSelectElement).value;
    const selectedTask = thisWeekTasks.find((task) => task.id === nextId) ?? null;
    pomodoroTimer.setSelectedTask(selectedTask?.id ?? null, selectedTask?.title ?? null);
  }

  function getHistoryTaskLabel(entry: PomodoroHistoryEntry): string | null {
    return entry.taskTitle ? `1 pomodoro · ${entry.taskTitle}` : null;
  }
</script>

<svelte:head>
  <title>Pomodoro — TaskpadSvel</title>
</svelte:head>

<div class="p-4 pb-40 sm:p-6 sm:pb-40">
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
            {$pomodoroTimer.focusMinutesToday} dk
          </div>
          <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {$pomodoroTimer.completedFocusToday} focus / {$pomodoroTimer.completedBreakToday} mola
          </div>
          <div class="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
            {syncLabel}
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <article class={`rounded-[28px] border px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 ${MODE_PANEL[$pomodoroTimer.mode]}`}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${MODE_BADGES[$pomodoroTimer.mode]}`}>
            {MODE_LABELS[$pomodoroTimer.mode]}
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
                style:width={`${Math.max(0, Math.min(100, completionRatio))}%`}
              ></div>
            </div>

            <div class="flex flex-col items-center gap-3">
              <div class="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Session Timer</div>
              <div class="font-mono text-6xl font-semibold tracking-tight text-zinc-950 sm:text-7xl dark:text-zinc-50">
                {formatPomodoroTime($pomodoroTimer.remainingSeconds)}
              </div>
              <div class="max-w-[18rem] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                {sessionHeadline}
              </div>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onclick={() => pomodoroTimer.switchMode('focus')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${$pomodoroTimer.mode === 'focus' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Focus 25m
            </button>
            <button
              onclick={() => pomodoroTimer.switchMode('short')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${$pomodoroTimer.mode === 'short' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Short 5m
            </button>
            <button
              onclick={() => pomodoroTimer.switchMode('long')}
              class={`rounded-full px-4 py-2 text-sm transition-colors ${$pomodoroTimer.mode === 'long' ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white/80 text-zinc-600 hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}
            >
              Long 15m
            </button>
          </div>

          <div class="mt-6 flex flex-wrap justify-center gap-3">
            {#if $pomodoroTimer.isRunning}
              <button
                onclick={pomodoroTimer.pauseSession}
                class="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                <CirclePause size={16} />
                Pause
              </button>
            {:else}
              <button
                onclick={pomodoroTimer.startSession}
                class="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                <Play size={16} />
                Start
              </button>
            {/if}

            <button
              onclick={pomodoroTimer.resetSession}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-5 py-3 text-sm text-zinc-700 transition-colors hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <RotateCcw size={16} />
              Reset
            </button>

            <button
              onclick={pomodoroTimer.skipSession}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-5 py-3 text-sm text-zinc-700 transition-colors hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <SkipForward size={16} />
              Skip
            </button>
          </div>
        </div>
      </article>

      <div class="flex flex-col gap-5">
        <Card class="rounded-[28px] border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <TimerReset size={16} />
            Current Focus
          </div>
          <div class="mt-4">
            <SectionHeader class="text-zinc-500 dark:text-zinc-400">Uzerinde calistigin gorev</SectionHeader>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Bu hafta planindan bir gorev secersen session gecmisine 1 pomodoro olarak baglanir.
            </p>
            <select
              value={$pomodoroTimer.selectedTaskId ?? ''}
              onchange={handleTaskSelection}
              class="mt-3 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200"
            >
              <option value="">- sec -</option>
              {#each thisWeekTasks as task}
                <option value={task.id}>{task.title} [{task.source}]</option>
              {/each}
            </select>
            {#if weeklyInstancesQuery.isLoading || monthlyInstancesQuery.isLoading}
              <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Bu haftanin gorevleri yukleniyor.</p>
            {:else if thisWeekTasks.length === 0}
              <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Bu hafta icin secilebilir gorev yok.
              </p>
            {/if}
          </div>
          <input
            type="text"
            value={$pomodoroTimer.focusLabel}
            oninput={handleFocusLabelInput}
            placeholder="Su an odaklandigin isi yaz..."
            class="mt-4 w-full rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:focus:border-zinc-500"
          />
          <div class="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-400">
            {$pomodoroTimer.focusLabel.trim() || 'No target selected'}
          </div>
        </Card>

        <article class="rounded-[28px] border border-zinc-200 bg-white/92 px-5 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Notifications</div>
            <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">
              {$pomodoroTimer.notificationPermission === 'granted'
                ? 'Enabled'
                : $pomodoroTimer.notificationPermission === 'unsupported'
                  ? 'Unsupported'
                  : 'Off'}
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button
              onclick={pomodoroTimer.enableNotifications}
              disabled={$pomodoroTimer.notificationPermission === 'granted' || $pomodoroTimer.notificationPermission === 'unsupported'}
              class="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {#if $pomodoroTimer.notificationPermission === 'granted'}
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
              <div class="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{$pomodoroTimer.completedFocusCount}</div>
            </div>
            <div class="rounded-[20px] border border-emerald-200/80 bg-emerald-50/80 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/18">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Break Count</div>
              <div class="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{$pomodoroTimer.completedBreakToday}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Today Key</div>
              <div class="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{getPomodoroDayKey()}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Next Break</div>
              <div class="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {$pomodoroTimer.completedFocusCount % 4 === 3 ? 'Long' : 'Short'}
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
            Son {POMODORO_HISTORY_RETENTION_DAYS} gun · {latestHistory.length} session
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
              {#if getHistoryTaskLabel(entry)}
                <div class="mt-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-400">
                  <ClipboardCheck size={12} />
                  {getHistoryTaskLabel(entry)}
                </div>
              {/if}
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
