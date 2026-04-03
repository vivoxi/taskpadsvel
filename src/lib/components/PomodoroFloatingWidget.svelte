<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { ChevronDown, ChevronUp, CirclePause, Maximize2, Play, TimerReset, X } from 'lucide-svelte';
  import { formatPomodoroTime, getPomodoroModeLabel, POMODORO_PRESETS } from '$lib/pomodoro';
  import { pomodoroTimer } from '$lib/stores/pomodoroTimer';

  const POMODORO_WIDGET_UI_KEY = 'taskpad:pomodoro-widget-ui:v1';

  let isCompact = $state(false);
  let isHidden = $state(false);

  onMount(() => {
    if (!browser) return;

    try {
      const stored = JSON.parse(localStorage.getItem(POMODORO_WIDGET_UI_KEY) ?? '{}') as {
        isCompact?: boolean;
        isHidden?: boolean;
      };
      isCompact = stored.isCompact === true;
      isHidden = stored.isHidden === true;
    } catch {
      isCompact = false;
      isHidden = false;
    }
  });

  $effect(() => {
    if (!browser) return;
    localStorage.setItem(
      POMODORO_WIDGET_UI_KEY,
      JSON.stringify({
        isCompact,
        isHidden
      })
    );
  });

  const modeTone = $derived(
    $pomodoroTimer.mode === 'focus'
      ? 'border-orange-200 bg-orange-50/90 dark:border-orange-500/20 dark:bg-orange-950/35'
      : $pomodoroTimer.mode === 'short'
        ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-500/20 dark:bg-emerald-950/30'
        : 'border-sky-200 bg-sky-50/90 dark:border-sky-500/20 dark:bg-sky-950/30'
  );
  const progressWidth = $derived(
    `${Math.max(
      0,
      Math.min(
        100,
        ((POMODORO_PRESETS[$pomodoroTimer.mode] - $pomodoroTimer.remainingSeconds) /
          POMODORO_PRESETS[$pomodoroTimer.mode]) *
          100
      )
    )}%`
  );
</script>

{#if isHidden}
  <button
    onclick={() => (isHidden = false)}
    class="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50/95 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-700 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.7)] backdrop-blur-xl transition-colors hover:bg-orange-100 dark:border-orange-500/20 dark:bg-orange-950/70 dark:text-orange-300"
    aria-label="Show Pomodoro widget"
  >
    <TimerReset size={14} />
    {formatPomodoroTime($pomodoroTimer.remainingSeconds)}
  </button>
{:else}
  <div class={`fixed bottom-4 right-4 z-40 ${isCompact ? 'w-[min(13.5rem,calc(100vw-2rem))]' : 'w-[min(20rem,calc(100vw-2rem))]'} rounded-[24px] border px-4 py-3 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.55)] backdrop-blur-xl transition-[width] duration-200 ${modeTone}`}>
    <div class="flex items-center justify-between gap-3">
      <a
        href="/pomodoro"
        class="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <TimerReset size={14} />
        {!isCompact ? 'Pomodoro' : 'Pomo'}
      </a>
      <div class="flex items-center gap-1">
        <button
          onclick={() => (isCompact = !isCompact)}
          class="rounded-full border border-zinc-200/80 bg-white/65 p-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label={isCompact ? 'Expand Pomodoro widget' : 'Collapse Pomodoro widget'}
        >
          {#if isCompact}
            <ChevronUp size={13} />
          {:else}
            <ChevronDown size={13} />
          {/if}
        </button>
        <a
          href="/pomodoro"
          class="rounded-full border border-zinc-200/80 bg-white/65 p-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-100"
          aria-label="Open Pomodoro page"
        >
          <Maximize2 size={13} />
        </a>
        <button
          onclick={() => (isHidden = true)}
          class="rounded-full border border-zinc-200/80 bg-white/65 p-1.5 text-zinc-500 transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400"
          aria-label="Hide Pomodoro widget"
        >
          <X size={13} />
        </button>
      </div>
    </div>

    <div class={`mt-3 flex items-end justify-between gap-3 ${isCompact ? 'mt-2' : ''}`}>
      <div class="min-w-0">
        {#if !isCompact}
          <div class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {getPomodoroModeLabel($pomodoroTimer.mode)}
          </div>
        {/if}
        <div class={`${isCompact ? 'text-2xl' : 'mt-1 text-3xl'} font-mono font-semibold tracking-tight text-zinc-950 dark:text-zinc-50`}>
          {formatPomodoroTime($pomodoroTimer.remainingSeconds)}
        </div>
        {#if !isCompact}
          <div class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {$pomodoroTimer.focusLabel.trim() || 'No focus label'}
          </div>
        {/if}
      </div>

      {#if $pomodoroTimer.isRunning}
        <button
          onclick={pomodoroTimer.pauseSession}
          class={`${isCompact ? 'h-10 w-10' : 'h-11 w-11'} inline-flex items-center justify-center rounded-full bg-zinc-950 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300`}
          aria-label="Pause Pomodoro"
        >
          <CirclePause size={18} />
        </button>
      {:else}
        <button
          onclick={pomodoroTimer.startSession}
          class={`${isCompact ? 'h-10 w-10' : 'h-11 w-11'} inline-flex items-center justify-center rounded-full bg-zinc-950 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300`}
          aria-label="Start Pomodoro"
        >
          <Play size={18} />
        </button>
      {/if}
    </div>

    <div class={`${isCompact ? 'mt-2 h-1' : 'mt-3 h-1.5'} overflow-hidden rounded-full bg-white/75 dark:bg-white/10`}>
      <div
        class="h-full rounded-full bg-orange-500 transition-all duration-300 dark:bg-orange-400"
        style:width={progressWidth}
      ></div>
    </div>
  </div>
{/if}
