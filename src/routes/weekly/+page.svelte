<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery } from '@tanstack/svelte-query';
  import {
    createWeeklyPeriodInstances,
    getWeeklyInstancesStorageKey,
    getWeeklyInstanceStatusStorageKey,
    parsePersistedPeriodInstances,
    parsePersistedPeriodInstanceStatus,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { summarizeInstances, summarizeSnapshot, summarizeTasks } from '$lib/periodSummary';
  import { supabase } from '$lib/supabase';
  import { getPreviousWeekKey, getWeekKey } from '$lib/weekUtils';
  import TaskList from '$lib/components/TaskList.svelte';
  import type { HistorySnapshot, Task } from '$lib/types';

  const currentWeekKey = getWeekKey();
  const previousWeekKey = getPreviousWeekKey(currentWeekKey);
  const weeklyInstancesStorageKey = getWeeklyInstancesStorageKey(currentWeekKey);
  const weeklyInstanceStatusStorageKey = getWeeklyInstanceStatusStorageKey(currentWeekKey);

  const tasksQuery = createQuery(() => ({
    queryKey: ['weekly_page', 'tasks'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'weekly')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser
  }));

  const weeklySummary = $derived(summarizeTasks(tasksQuery.data ?? []));
  const previousSnapshotQuery = createQuery(() => ({
    queryKey: ['weekly_page', 'previous_snapshot', previousWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'weekly')
        .eq('period_key', previousWeekKey)
        .maybeSingle();
      if (error) throw error;
      return data as HistorySnapshot | null;
    },
    enabled: browser
  }));
  const previousWeeklySummary = $derived(summarizeSnapshot(previousSnapshotQuery.data));
  const carryoverTasks = $derived((previousSnapshotQuery.data?.missed_tasks ?? []) as Task[]);

  const weeklyInstancesPreferenceQuery = createQuery(() => ({
    queryKey: ['weekly_page', 'period_instances', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', weeklyInstancesStorageKey)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
    enabled: browser
  }));
  const weeklyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['weekly_page', 'period_instance_status', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', weeklyInstanceStatusStorageKey)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
    enabled: browser
  }));

  let weeklyPeriodInstances = $state<PersistedPeriodTaskInstance[]>([]);
  let weeklyCompletedInstanceKeys = $state<string[]>([]);

  const generatedWeeklyInstances = $derived(
    createWeeklyPeriodInstances({
      weekKey: currentWeekKey,
      weeklyTasks: tasksQuery.data ?? [],
      previousWeeklySnapshot: previousSnapshotQuery.data
    })
  );

  $effect(() => {
    const persisted = parsePersistedPeriodInstances(weeklyInstancesPreferenceQuery.data);
    weeklyPeriodInstances = persisted?.instances.length ? persisted.instances : generatedWeeklyInstances;
  });

  $effect(() => {
    const persisted = parsePersistedPeriodInstanceStatus(weeklyInstanceStatusQuery.data);
    weeklyCompletedInstanceKeys = persisted?.completedInstanceKeys ?? [];
  });

  $effect(() => {
    if (!browser || !tasksQuery.isSuccess || !previousSnapshotQuery.isSuccess || !weeklyInstancesPreferenceQuery.isSuccess) {
      return;
    }

    const persisted = parsePersistedPeriodInstances(weeklyInstancesPreferenceQuery.data);
    const nextValue = {
      instances: generatedWeeklyInstances,
      updatedAt: new Date().toISOString()
    };

    const persistedJson = JSON.stringify(persisted?.instances ?? []);
    const nextJson = JSON.stringify(nextValue.instances);

    if (persistedJson === nextJson) return;

    supabase
      .from('user_preferences')
      .upsert(
        {
          key: weeklyInstancesStorageKey,
          value: nextValue,
          updated_at: nextValue.updatedAt
        },
        { onConflict: 'key' }
      )
      .then(({ error }) => {
        if (error) console.error('Failed to save weekly period instances', error);
      });
  });

  const weeklyInstanceSummary = $derived(
    summarizeInstances(weeklyPeriodInstances, weeklyCompletedInstanceKeys)
  );
</script>

<svelte:head>
  <title>Weekly Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-4 sm:p-6">
  <div class="mx-auto flex max-w-5xl flex-col gap-6">
    <section class="rounded-[28px] border border-zinc-200 bg-orange-50/70 px-6 py-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.3)] dark:border-zinc-800 dark:bg-orange-950/12">
      <div class="inline-flex items-center rounded-full border border-orange-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-700 dark:border-orange-500/20 dark:bg-white/6 dark:text-orange-300">
        Recurring Work
      </div>
      <h1 class="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Weekly Tasks
      </h1>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Add your routine tasks here, set how many hours each one needs, and AI will place them into the week.
      </p>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
          <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Planned Hours</div>
          <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {weeklyInstanceSummary.plannedHours || weeklySummary.plannedHours}h
          </div>
        </div>
        <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
          <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Completed Hours</div>
          <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {weeklyInstanceSummary.completedHours}h
          </div>
        </div>
        <div class="rounded-[20px] border border-white/70 bg-white/72 px-4 py-3 dark:border-white/6 dark:bg-zinc-950/42">
          <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Open Hours</div>
          <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {weeklyInstanceSummary.openHours || weeklySummary.openHours}h
          </div>
        </div>
      </div>

      {#if carryoverTasks.length > 0}
        <div class="mt-5 rounded-[22px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/16">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            Carry-over from last week
          </div>
          <div class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {previousWeeklySummary.openTasks} task · {previousWeeklySummary.openHours}h acik kaldi
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            {#each carryoverTasks as task (task.id)}
              <div class="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-sm text-zinc-700 dark:border-amber-500/20 dark:bg-zinc-950/60 dark:text-zinc-200">
                {task.title}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if weeklyPeriodInstances.length > 0}
        <div class="mt-5 rounded-[22px] border border-zinc-200/80 bg-white/72 p-4 dark:border-white/6 dark:bg-zinc-950/42">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Current Week Instances
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            {#each weeklyPeriodInstances as instance (instance.instance_key)}
              <div class={`rounded-full border px-3 py-1.5 text-sm ${
                instance.carryover
                  ? 'border-amber-200 bg-amber-50 text-zinc-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-zinc-100'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
              }`}>
                <span class={weeklyCompletedInstanceKeys.includes(instance.instance_key) ? 'line-through opacity-70' : ''}>
                  {instance.title} · {instance.estimated_hours ?? 1}h
                </span>
                {#if instance.carryover} · carry-over{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
      <TaskList type="weekly" />
    </section>
  </div>
</div>
