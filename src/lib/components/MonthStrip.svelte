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
  style="
    display:flex; align-items:center; gap:8px;
    padding:6px 16px; border-bottom:1px solid var(--border);
    background:var(--panel-soft);
    position:sticky; top:0; z-index:20;
  "
>
  <!-- Year picker -->
  <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
    <button
      onclick={() => browseYear--}
      style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;color:var(--text-faint);background:none;border:none;cursor:pointer;border-radius:4px;padding:0"
      aria-label="Previous year"
    >
      <ChevronLeft size={13} />
    </button>
    <span style="font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums;min-width:36px;text-align:center">
      {browseYear}
    </span>
    <button
      onclick={() => browseYear++}
      style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;color:var(--text-faint);background:none;border:none;cursor:pointer;border-radius:4px;padding:0"
      aria-label="Next year"
    >
      <ChevronRight size={13} />
    </button>
  </div>

  <!-- Month chips -->
  <div style="display:flex;flex:1;gap:2px;overflow-x:auto">
    {#each MONTH_LABELS as label, i}
      {@const m = i + 1}
      {@const isSelected = browseYear === currentYear && m === currentMonthNum}
      {@const isToday = browseYear === todayYear && m === todayMonthNum}
      <button
        onclick={() => goToMonth(browseYear, m)}
        style="
          position:relative; flex:1; padding:4px 2px; border-radius:4px; border:none;
          font-size:11px; cursor:pointer; transition:all 150ms;
          background:{isSelected ? 'var(--accent)' : 'transparent'};
          color:{isSelected ? '#fff' : 'var(--text-muted)'};
          min-width:2rem;
        "
      >
        {label}
        {#if isToday && !isSelected}
          <span
            style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent)"
          ></span>
        {/if}
      </button>
    {/each}
  </div>
</div>
