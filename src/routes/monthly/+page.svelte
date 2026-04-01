<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import TaskList from '$lib/components/TaskList.svelte';
  import { supabase } from '$lib/supabase';
  import { addMonths, getMonthKey, monthLabel } from '$lib/weekUtils';
  import type { HistorySnapshot, Task } from '$lib/types';

  const today = new Date();
  let monthOffset = $state(0);

  const currentMonthKey = $derived(getMonthKey(addMonths(today, monthOffset)));
  const isPastMonth = $derived(monthOffset < 0);

  const snapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', 'monthly', currentMonthKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'monthly')
        .eq('period_key', currentMonthKey)
        .maybeSingle();
      if (error) throw error;
      return data as HistorySnapshot | null;
    },
    enabled: browser && isPastMonth
  }));

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }
</script>

<svelte:head>
  <title>Monthly Tasks — TaskpadSvel</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-auto p-4 sm:p-6">
    <div class="mx-auto flex max-w-5xl flex-col gap-6">
      <section class="rounded-[28px] border border-zinc-200 bg-sky-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-sky-950/12">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="inline-flex items-center rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:border-sky-500/20 dark:bg-white/6 dark:text-sky-300">
              Monthly Cycle
            </div>
            <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Monthly Tasks
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Keep month-long recurring work visible, then jump back to archived months whenever you want to review what was completed.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3 rounded-[22px] border border-zinc-200/80 bg-white/78 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/45">
            <button
              onclick={() => monthOffset -= 1}
              class="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
            </button>
            <span class="min-w-[120px] text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {monthLabel(currentMonthKey)}
            </span>
            <button
              onclick={() => monthOffset = Math.min(monthOffset + 1, 0)}
              disabled={monthOffset === 0}
              class="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronRight size={16} />
            </button>
            {#if monthOffset !== 0}
              <button
                onclick={() => monthOffset = 0}
                class="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Current month
              </button>
            {/if}
          </div>
        </div>

        {#if isPastMonth}
          <div class="mt-4 text-xs uppercase tracking-[0.22em] text-zinc-400">
            Archived Month — Read Only
          </div>
        {/if}
      </section>

    {#if isPastMonth}
      {#if snapshotQuery.isLoading}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400">Loading…</div>
      {:else if !snapshotQuery.data}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400 italic">
          No snapshot found for this month.
        </div>
      {:else}
        <div class="flex flex-col gap-6">
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3">
            <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Completion Rate
            </span>
            <div class="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {Math.round((snapshotQuery.data.completion_rate ?? 0) * 100)}%
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
              Completed
            </h3>
            {#if getPastCompletedTasks().length === 0}
              <div class="text-sm text-zinc-400 italic">No completed tasks recorded.</div>
            {:else}
              {#each getPastCompletedTasks() as task (task.id)}
                <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 text-sm text-zinc-400 line-through">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400">
                    <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                      <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  {task.title}
                </div>
              {/each}
            {/if}
          </div>

          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              Missed
            </h3>
            {#if getPastMissedTasks().length === 0}
              <div class="text-sm text-zinc-400 italic">No missed tasks recorded.</div>
            {:else}
              {#each getPastMissedTasks() as task (task.id)}
                <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300">
                  {task.title}
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
        <TaskList type="monthly" />
      </section>
    {/if}
    </div>
  </div>
</div>
