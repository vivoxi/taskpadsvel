<script lang="ts">
  import { CirclePause, Maximize2, Play, TimerReset } from 'lucide-svelte';
  import { formatPomodoroTime, getPomodoroModeLabel, POMODORO_PRESETS } from '$lib/pomodoro';
  import { pomodoroTimer } from '$lib/stores/pomodoroTimer';

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

<div class={`fixed bottom-4 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[24px] border px-4 py-3 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.55)] backdrop-blur-xl ${modeTone}`}>
  <div class="flex items-center justify-between gap-3">
    <a
      href="/pomodoro"
      class="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <TimerReset size={14} />
      Pomodoro
    </a>
    <a
      href="/pomodoro"
      class="rounded-full border border-zinc-200/80 bg-white/65 p-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-100"
      aria-label="Open Pomodoro page"
    >
      <Maximize2 size={13} />
    </a>
  </div>

  <div class="mt-3 flex items-end justify-between gap-3">
    <div class="min-w-0">
      <div class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {getPomodoroModeLabel($pomodoroTimer.mode)}
      </div>
      <div class="mt-1 font-mono text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {formatPomodoroTime($pomodoroTimer.remainingSeconds)}
      </div>
      <div class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
        {$pomodoroTimer.focusLabel.trim() || 'No focus label'}
      </div>
    </div>

    {#if $pomodoroTimer.isRunning}
      <button
        onclick={pomodoroTimer.pauseSession}
        class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
        aria-label="Pause Pomodoro"
      >
        <CirclePause size={18} />
      </button>
    {:else}
      <button
        onclick={pomodoroTimer.startSession}
        class="inline-flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950 text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
        aria-label="Start Pomodoro"
      >
        <Play size={18} />
      </button>
    {/if}
  </div>

  <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/75 dark:bg-white/10">
    <div
      class="h-full rounded-full bg-orange-500 transition-all duration-300 dark:bg-orange-400"
      style:width={progressWidth}
    ></div>
  </div>
</div>
