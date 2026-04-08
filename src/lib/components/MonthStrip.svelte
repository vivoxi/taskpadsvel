<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  let {
    monthKey,
    basePath = '/dashboard'
  }: {
    monthKey: string;
    basePath?: string;
  } = $props();

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonthNum = today.getMonth() + 1;

  const currentYear = $derived(parseInt(monthKey.slice(0, 4), 10));
  const currentMonthNum = $derived(parseInt(monthKey.slice(5, 7), 10));

  // Intentionally non-reactive init; $effect below keeps browseYear in sync on navigation
  let browseYear = $state(untrack(() => parseInt(monthKey.slice(0, 4), 10) || new Date().getFullYear()));
  $effect(() => { browseYear = currentYear; });

  function goToMonth(year: number, month: number) {
    void goto(`${basePath}?month=${year}-${String(month).padStart(2, '0')}`);
  }
</script>

<div
  class="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/80 px-4 py-2 backdrop-blur"
>
  <!-- Year picker -->
  <div class="flex items-center gap-1">
    <button
      onclick={() => browseYear--}
      class="flex h-6 w-6 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
      aria-label="Previous year"
    >
      <ChevronLeft size={13} />
    </button>
    <span class="w-10 text-center text-xs font-semibold tabular-nums text-[var(--text-muted)]">
      {browseYear}
    </span>
    <button
      onclick={() => browseYear++}
      class="flex h-6 w-6 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
      aria-label="Next year"
    >
      <ChevronRight size={13} />
    </button>
  </div>

  <!-- Month chips -->
  <div class="flex flex-1 gap-0.5 overflow-x-auto">
    {#each MONTH_LABELS as label, i}
      {@const m = i + 1}
      {@const isSelected = browseYear === currentYear && m === currentMonthNum}
      {@const isToday = browseYear === todayYear && m === todayMonthNum}
      <button
        onclick={() => goToMonth(browseYear, m)}
        class={[
          'relative flex h-7 min-w-[2.4rem] flex-1 items-center justify-center rounded-md text-[11px] font-medium transition-colors',
          isSelected
            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-primary)]'
        ].join(' ')}
      >
        {label}
        {#if isToday && !isSelected}
          <span
            class="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--text-faint)]"
          ></span>
        {/if}
      </button>
    {/each}
  </div>
</div>
