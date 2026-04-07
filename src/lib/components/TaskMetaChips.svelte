<script lang="ts">
  import type { TaskPriority, TaskSourceType } from '$lib/planner/types';

  let {
    priority = 'medium',
    dueDate = null,
    hours = null,
    category = null,
    sourceType = 'weekly',
    carried = false,
    archived = false,
    compact = false
  }: {
    priority?: TaskPriority;
    dueDate?: string | null;
    hours?: number | null;
    category?: string | null;
    sourceType?: TaskSourceType;
    carried?: boolean;
    archived?: boolean;
    compact?: boolean;
  } = $props();

  const priorityClass = $derived(
    priority === 'high'
      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
      : priority === 'low'
        ? 'border-zinc-200 bg-transparent text-[var(--text-muted)] dark:border-zinc-700'
        : 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
  );
</script>

<div class={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'pt-1'}`}>
  <span class={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${priorityClass}`}>
    {priority}
  </span>

  {#if hours !== null}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {hours}h
    </span>
  {/if}

  {#if dueDate}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      Due {new Date(dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
    </span>
  {/if}

  {#if category}
    <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {category}
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
