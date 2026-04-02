<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import {
    MONTHLY_PLAN_DAYS,
    MONTHLY_PLAN_WEEKS,
    buildMonthlyPlanBoardFromInstances
  } from '$lib/monthlyPlan';
  import {
    createMonthlyPeriodInstances,
    getMonthlyInstanceStatusStorageKey,
    getMonthlyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    updateCompletedInstanceKeys,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { summarizeInstances, summarizeSnapshot } from '$lib/periodSummary';
  import { supabase } from '$lib/supabase';
  import { addMonths, getMonthKey, getPreviousMonthKey, monthLabel } from '$lib/weekUtils';
  import type { HistorySnapshot, Task } from '$lib/types';

  const queryClient = useQueryClient();
  const today = new Date();
  let monthOffset = $state(0);

  const currentMonthKey = $derived(getMonthKey(addMonths(today, monthOffset)));
  const isPastMonth = $derived(monthOffset < 0);
  const previousMonthKey = $derived(getPreviousMonthKey(currentMonthKey));
  const monthlyInstancesStorageKey = $derived(getMonthlyInstancesStorageKey(currentMonthKey));
  const monthlyInstanceStatusStorageKey = $derived(
    getMonthlyInstanceStatusStorageKey(currentMonthKey)
  );

  const tasksQuery = createQuery(() => ({
    queryKey: ['thismonth_page', 'tasks'] as const,
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

  const monthlyInstancesQuery = createQuery(() => ({
    queryKey: ['thismonth_page', 'period_instances', currentMonthKey] as const,
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
    queryKey: ['thismonth_page', 'period_instance_status', currentMonthKey] as const,
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
  const monthlyInstanceSummary = $derived(
    summarizeInstances(monthlyPeriodInstances, monthlyCompletedInstanceKeys)
  );
  const previousMonthlySummary = $derived(summarizeSnapshot(previousSnapshotQuery.data));
  const monthlyCarryoverTasks = $derived((previousSnapshotQuery.data?.missed_tasks ?? []) as Task[]);

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  function isInstanceCompleted(instanceKey: string): boolean {
    return monthlyCompletedInstanceKeys.includes(instanceKey);
  }

  function hasCarryover(instance: unknown): boolean {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'carryover' in instance &&
      (instance as { carryover?: unknown }).carryover === true
    );
  }

  $effect(() => {
    if (isPastMonth) {
      monthlyPeriodInstances = [];
      return;
    }

    const persisted = parsePersistedPeriodInstances(monthlyInstancesQuery.data);
    monthlyPeriodInstances = persisted?.instances.length
      ? persisted.instances
      : generatedMonthlyInstances;
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
    if (
      !browser ||
      isPastMonth ||
      !tasksQuery.isSuccess ||
      !previousSnapshotQuery.isSuccess ||
      !monthlyInstancesQuery.isSuccess
    ) {
      return;
    }

    const persisted = parsePersistedPeriodInstances(monthlyInstancesQuery.data);
    const nextValue = {
      instances: generatedMonthlyInstances,
      updatedAt: new Date().toISOString()
    };

    if (JSON.stringify(persisted?.instances ?? []) === JSON.stringify(nextValue.instances)) {
      return;
    }

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

  async function toggleInstance(instanceKey: string) {
    if (isPastMonth) return;

    const nextCompletedInstanceKeys = updateCompletedInstanceKeys(
      monthlyCompletedInstanceKeys,
      instanceKey,
      !isInstanceCompleted(instanceKey)
    );
    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: monthlyInstanceStatusStorageKey,
        value: {
          completedInstanceKeys: nextCompletedInstanceKeys,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (error) {
      toast.error('Failed to update this month status');
      return;
    }

    monthlyCompletedInstanceKeys = nextCompletedInstanceKeys;
    queryClient.setQueryData(
      ['thismonth_page', 'period_instance_status', currentMonthKey],
      {
        completedInstanceKeys: nextCompletedInstanceKeys,
        updatedAt
      }
    );
  }
</script>

<svelte:head>
  <title>This Month — TaskpadSvel</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-auto p-4 sm:p-6">
    <div class="mx-auto flex max-w-5xl flex-col gap-6">
      <section class="rounded-[28px] border border-zinc-200 bg-sky-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-sky-950/12">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="inline-flex items-center rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:border-sky-500/20 dark:bg-white/6 dark:text-sky-300">
              This Month
            </div>
            <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Monthly Execution Board
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Aylık recurring işlerin bu ay hangi hafta/güne düştüğünü gör, tamamlananları
              işaretle, geçmiş aylarda neyi kaçırdığını archive’dan takip et.
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
              {isPastMonth
                ? summarizeSnapshot(snapshotQuery.data).plannedHours
                : monthlyInstanceSummary.plannedHours}h
            </div>
          </div>
          <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Completed Hours</div>
            <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {isPastMonth
                ? summarizeSnapshot(snapshotQuery.data).completedHours
                : monthlyInstanceSummary.completedHours}h
            </div>
          </div>
          <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
            <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Open Hours</div>
            <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {isPastMonth
                ? summarizeSnapshot(snapshotQuery.data).openHours
                : monthlyInstanceSummary.openHours}h
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
          </div>
        {/if}
      </section>

      {#if isPastMonth}
        {#if snapshotQuery.isLoading}
          <div class="flex h-40 items-center justify-center text-sm text-zinc-400">Loading…</div>
        {:else if !snapshotQuery.data}
          <div class="flex h-40 items-center justify-center text-sm italic text-zinc-400">
            No snapshot found for this month.
          </div>
        {:else}
          <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
            <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Completion Rate: {Math.round((snapshotQuery.data.completion_rate ?? 0) * 100)}%
            </div>

            <div class="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                  Completed
                </h3>
                <div class="mt-3 flex flex-col gap-2">
                  {#if getPastCompletedTasks().length === 0}
                    <div class="text-sm italic text-zinc-400">No completed tasks recorded.</div>
                  {:else}
                    {#each getPastCompletedTasks() as task (task.id)}
                      <div class="rounded-md border border-green-200 bg-green-50/30 px-3 py-2 text-sm text-zinc-400 line-through dark:border-green-900 dark:bg-green-950/20">
                        {task.title}
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>

              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Missed
                </h3>
                <div class="mt-3 flex flex-col gap-2">
                  {#if getPastMissedTasks().length === 0}
                    <div class="text-sm italic text-zinc-400">No missed tasks recorded.</div>
                  {:else}
                    {#each getPastMissedTasks() as task (task.id)}
                      <div class="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {task.title}
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            </div>
          </section>
        {/if}
      {:else}
        <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Monthly Spread</div>
              <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                Bu ayın monthly instance'ları hafta/gün bazında
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
                  {@const cell = monthlyPlanBoard.cells.find(
                    (item) => item.week === week && item.day === day
                  )}
                  <div class="min-h-[120px] rounded-[18px] border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                    {#if cell && cell.tasks.length > 0}
                      <div class="flex flex-col gap-2">
                        {#each cell.tasks as instance (instance.instance_key)}
                          <button
                            onclick={() => toggleInstance(instance.instance_key)}
                            class={`w-full rounded-[14px] border px-3 py-2 text-left transition-colors ${
                              isInstanceCompleted(instance.instance_key)
                                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20'
                                : 'border-sky-200/80 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-950/18'
                            }`}
                          >
                            <div
                              class={`text-sm font-medium ${
                                isInstanceCompleted(instance.instance_key)
                                  ? 'text-zinc-400 line-through'
                                  : 'text-zinc-900 dark:text-zinc-100'
                              }`}
                            >
                              {instance.title}
                            </div>
                            <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {instance.estimated_hours ?? 1}h{#if hasCarryover(instance)} · carry-over{/if}
                            </div>
                          </button>
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
                {#each monthlyPlanBoard.flexibleTasks as instance (instance.instance_key)}
                  <button
                    onclick={() => toggleInstance(instance.instance_key)}
                    class={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      isInstanceCompleted(instance.instance_key)
                        ? 'border-emerald-200 bg-emerald-50 text-zinc-500 line-through dark:border-emerald-500/20 dark:bg-emerald-950/20'
                        : 'border-amber-200 bg-white/80 text-zinc-700 dark:border-amber-500/20 dark:bg-zinc-950/60 dark:text-zinc-200'
                    }`}
                  >
                    {instance.title} · {instance.estimated_hours ?? 1}h
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</div>
