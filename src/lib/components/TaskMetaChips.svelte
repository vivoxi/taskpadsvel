<script lang="ts">
  import type { TaskSourceType } from '$lib/planner/types';

  let {
    hours = null,
    sourceType = 'weekly',
    carried = false,
    archived = false,
    compact = false
  }: {
    hours?: number | null;
    sourceType?: TaskSourceType;
    carried?: boolean;
    archived?: boolean;
    compact?: boolean;
  } = $props();
</script>

<div class={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'pt-1'}`}>
  {#if hours !== null}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {hours}h
    </span>
  {/if}

  <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
    {sourceType}
  </span>

  {#if carried}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      Carry
    </span>
  {/if}

  {#if archived}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      Archived
    </span>
  {/if}
</div>
