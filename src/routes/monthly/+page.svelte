<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import TaskList from '$lib/components/TaskList.svelte';
  import {
    buildMonthlyPlanBoardFromInstances,
    MONTHLY_PLAN_DAYS,
    MONTHLY_PLAN_WEEKS
  } from '$lib/monthlyPlan';
  import {
    createMonthlyPeriodInstances,
    getMonthlyInstancesStorageKey,
    getMonthlyInstanceStatusStorageKey,
    parsePersistedPeriodInstances,
    parsePersistedPeriodInstanceStatus,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { summarizeInstances, summarizeSnapshot, summarizeTasks } from '$lib/periodSummary';
  import { supabase } from '$lib/supabase';
  import { addMonths, getMonthKey, getPreviousMonthKey, monthLabel } from '$lib/weekUtils';
  import type { HistorySnapshot, Task } from '$lib/types';

  const today = new Date();
  let monthOffset = $state(0);

  const currentMonthKey = $derived(getMonthKey(addMonths(today, monthOffset)));
  const isPastMonth = $derived(monthOffset < 0);
  const previousMonthKey = $derived(getPreviousMonthKey(currentMonthKey));
  const monthlyInstancesStorageKey = $derived(getMonthlyInstancesStorageKey(currentMonthKey));
  const monthlyInstanceStatusStorageKey = $derived(getMonthlyInstanceStatusStorageKey(currentMonthKey));

  const tasksQuery = createQuery(() => ({
    queryKey: ['monthly_page', 'tasks'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'monthly')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser && !isPastMonth
  }));

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

  const previousSnapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', 'monthly_previous', previousMonthKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'monthly')
        .eq('period_key', previousMonthKey)
        .maybeSingle();
      if (error) throw error;
      return data as HistorySnapshot | null;
    },
    enabled: browser && !isPastMonth
  }));

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  const monthlyInstancesPreferenceQuery = createQuery(() => ({
    queryKey: ['monthly_page', 'period_instances', currentMonthKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', monthlyInstancesStorageKey)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
    enabled: browser && !isPastMonth
  }));
  const monthlyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['monthly_page', 'period_instance_status', currentMonthKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', monthlyInstanceStatusStorageKey)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
    enabled: browser && !isPastMonth
  }));

  const monthlySummary = $derived(
    isPastMonth ? summarizeSnapshot(snapshotQuery.data) : summarizeTasks(tasksQuery.data ?? [])
  );
  const previousMonthlySummary = $derived(summarizeSnapshot(previousSnapshotQuery.data));
  const monthlyCarryoverTasks = $derived((previousSnapshotQuery.data?.missed_tasks ?? []) as Task[]);
  let monthlyPeriodInstances = $state<PersistedPeriodTaskInstance[]>([]);
  let monthlyCompletedInstanceKeys = $state<string[]>([]);
  const generatedMonthlyInstances = $derived(
    createMonthlyPeriodInstances({
      monthKey: currentMonthKey,
      monthlyTasks: tasksQuery.data ?? [],
      previousMonthlySnapshot: previousSnapshotQuery.data
    })
  );
  const monthlyPlanBoard = $derived(buildMonthlyPlanBoardFromInstances(monthlyPeriodInstances));

  $effect(() => {
    if (isPastMonth) {
      monthlyPeriodInstances = [];
      return;
    }

    const persisted = parsePersistedPeriodInstances(monthlyInstancesPreferenceQuery.data);
    monthlyPeriodInstances = persisted?.instances.length ? persisted.instances : generatedMonthlyInstances;
  });

  $effect(() => {
    if (isPastMonth) {
      monthlyCompletedInstanceKeys = [];
      return;
    }

    const persisted = parsePersistedPeriodInstanceStatus(monthlyInstanceStatusQuery.data);
    monthlyCompletedInstanceKeys = persisted?.completedInstanceKeys ?? [];
  });

  $effect(() => {
    if (!browser || isPastMonth || !tasksQuery.isSuccess || !previousSnapshotQuery.isSuccess || !monthlyInstancesPreferenceQuery.isSuccess) {
      return;
    }

    const persisted = parsePersistedPeriodInstances(monthlyInstancesPreferenceQuery.data);
    const nextValue = {
      instances: generatedMonthlyInstances,
      updatedAt: new Date().toISOString()
    };

    const persistedJson = JSON.stringify(persisted?.instances ?? []);
    const nextJson = JSON.stringify(nextValue.instances);
    if (persistedJson === nextJson) return;

    supabase
      .from('user_preferences')
      .upsert(
        {
          key: monthlyInstancesStorageKey,
          value: nextValue,
          updated_at: nextValue.updatedAt
        },
        { onConflict: 'key' }
      )
      .then(({ error }) => {
        if (error) console.error('Failed to save monthly period instances', error);
      });
  });

  const monthlyInstanceSummary = $derived(
    summarizeInstances(monthlyPeriodInstances, monthlyCompletedInstanceKeys)
  );
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

        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Planned Hours</div>
            <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {isPastMonth ? monthlySummary.plannedHours : monthlyInstanceSummary.plannedHours || monthlySummary.plannedHours}h
            </div>
          </div>
          <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Completed Hours</div>
            <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {isPastMonth ? monthlySummary.completedHours : monthlyInstanceSummary.completedHours}h
            </div>
          </div>
          <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Open Hours</div>
            <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {isPastMonth ? monthlySummary.openHours : monthlyInstanceSummary.openHours || monthlySummary.openHours}h
            </div>
          </div>
        </div>

        {#if !isPastMonth && monthlyCarryoverTasks.length > 0}
          <div class="mt-5 rounded-[22px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/16">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              Carry-over from last month
            </div>
            <div class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {previousMonthlySummary.openTasks} task · {previousMonthlySummary.openHours}h acik kaldi
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              {#each monthlyCarryoverTasks as task (task.id)}
                <div class="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-sm text-zinc-700 dark:border-amber-500/20 dark:bg-zinc-950/60 dark:text-zinc-200">
                  {task.title}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if !isPastMonth && monthlyPeriodInstances.length > 0}
          <div class="mt-5 rounded-[22px] border border-zinc-200/80 bg-white/72 p-4 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Current Month Instances
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              {#each monthlyPeriodInstances as instance (instance.instance_key)}
                <div class={`rounded-full border px-3 py-1.5 text-sm ${
                  instance.carryover
                    ? 'border-amber-200 bg-amber-50 text-zinc-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-zinc-100'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                }`}>
                  <span class={monthlyCompletedInstanceKeys.includes(instance.instance_key) ? 'line-through opacity-70' : ''}>
                    {instance.title} · {instance.estimated_hours ?? 1}h
                  </span>
                  {#if instance.carryover} · carry-over{/if}
                </div>
              {/each}
            </div>
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
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Monthly Spread</div>
            <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              Hangi haftada hangi monthly is planlandigi
            </div>
          </div>
        </div>

        <div class="mt-5 overflow-x-auto">
          <div class="grid min-w-[760px] grid-cols-[96px_repeat(5,minmax(0,1fr))] gap-3">
            <div></div>
            {#each MONTHLY_PLAN_DAYS as day}
              <div class="rounded-[16px] border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400">
                {day.slice(0, 3)}
              </div>
            {/each}

            {#each MONTHLY_PLAN_WEEKS as week}
              <div class="rounded-[18px] border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
                Week {week}
              </div>
              {#each MONTHLY_PLAN_DAYS as day}
                {@const cell = monthlyPlanBoard.cells.find((item) => item.week === week && item.day === day)}
                <div class="min-h-[120px] rounded-[18px] border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  {#if cell && cell.tasks.length > 0}
                    <div class="flex flex-col gap-2">
                      {#each cell.tasks as task (task.instance_key)}
                        <div class="rounded-[14px] border border-sky-200/80 bg-sky-50/80 px-3 py-2 dark:border-sky-500/20 dark:bg-sky-950/18">
                          <div class="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {task.title}
                          </div>
                          <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {task.estimated_hours ?? 1}h
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-xs italic text-zinc-400">No fixed task</div>
                  {/if}
                </div>
              {/each}
            {/each}
          </div>
        </div>

        {#if monthlyPlanBoard.flexibleTasks.length > 0}
          <div class="mt-5 rounded-[22px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/16">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              Flexible Monthly Tasks
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              {#each monthlyPlanBoard.flexibleTasks as task (task.instance_key)}
                <div class="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-sm text-zinc-700 dark:border-amber-500/20 dark:bg-zinc-950/60 dark:text-zinc-200">
                  {task.title} · {task.estimated_hours ?? 1}h
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
        <TaskList type="monthly" />
      </section>
    {/if}
    </div>
  </div>
</div>
