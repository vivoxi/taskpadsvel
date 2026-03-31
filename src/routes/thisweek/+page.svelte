<script lang="ts">
  import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import DayCard from '$lib/components/DayCard.svelte';
  import ScheduleDay from '$lib/components/ScheduleDay.svelte';
  import { supabase } from '$lib/supabase';
  import { weekOffset, generatedWeeks, authPassword } from '$lib/stores';
  import { getWeekKey, getWeekDays, weekLabel, addWeeks, DAY_NAMES } from '$lib/weekUtils';
  import type { ScheduleBlock, WeeklyPlan, HistorySnapshot, Task } from '$lib/types';

  const queryClient = useQueryClient();
  const today = new Date();
  const currentWeekKey = $derived(getWeekKey(addWeeks(today, $weekOffset)));
  const isPastWeek = $derived($weekOffset < 0);
  const weekDays = $derived(getWeekDays(currentWeekKey));

  function isToday(dayIndex: number): boolean {
    if ($weekOffset !== 0) return false;
    return new Date().getDay() === (dayIndex + 1) % 7;
  }

  const planQuery = createQuery(() => ({
    queryKey: ['weekly_plan', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_plan')
        .select('*')
        .eq('week_key', currentWeekKey);
      if (error) throw error;
      return (data ?? []) as WeeklyPlan[];
    },
    enabled: browser && !isPastWeek
  }));

  function getPlanContent(day: string): string {
    return planQuery.data?.find((p) => p.day === day)?.content ?? '';
  }

  const scheduleQuery = createQuery(() => ({
    queryKey: ['weekly_schedule', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_schedule')
        .select('*')
        .eq('week_key', currentWeekKey)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleBlock[];
    },
    enabled: browser
  }));

  function getBlocksForDay(day: string): ScheduleBlock[] {
    return (scheduleQuery.data ?? []).filter((b) => b.day === day);
  }

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks_all'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser && !isPastWeek
  }));

  let generating = $state(false);
  let autoGenAttempted = $state(false);

  $effect(() => {
    if (!browser || isPastWeek || autoGenAttempted) return;
    if (!scheduleQuery.data || !tasksQuery.data) return;
    if (scheduleQuery.data.length > 0) return;
    let alreadyGenerated = false;
    generatedWeeks.subscribe((s) => (alreadyGenerated = s.has(currentWeekKey)))();
    if (alreadyGenerated) return;
    autoGenAttempted = true;
    generateSchedule();
  });

  async function generateSchedule() {
    if (isPastWeek || generating) return;
    generating = true;
    const tasks = tasksQuery.data ?? [];
    let password = '';
    authPassword.subscribe((p) => (password = p))();
    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { Authorization: `Bearer ${password}` } : {})
        },
        body: JSON.stringify({
          weekKey: currentWeekKey,
          weeklyTasks: tasks.filter((t) => t.type === 'weekly'),
          monthlyTasks: tasks.filter((t) => t.type === 'monthly'),
          randomTasks: tasks.filter((t) => t.type === 'random')
        })
      });
      if (!res.ok) throw new Error(await res.text());
      generatedWeeks.update((s) => new Set([...s, currentWeekKey]));
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.success('Schedule generated');
    } catch (err) {
      toast.error('Failed to generate schedule');
      console.error(err);
    } finally {
      generating = false;
    }
  }

  const snapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', currentWeekKey] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'weekly')
        .eq('period_key', currentWeekKey)
        .maybeSingle();
      return data as HistorySnapshot | null;
    },
    enabled: browser && isPastWeek
  }));

  function getPastPlannerNote(day: string): string {
    return snapshotQuery.data?.planner_notes?.[day] ?? '';
  }

  function getPastTasks(): Task[] {
    if (!snapshotQuery.data) return [];
    return [
      ...((snapshotQuery.data.completed_tasks ?? []) as Task[]),
      ...((snapshotQuery.data.missed_tasks ?? []) as Task[])
    ];
  }

  function onBlocksReordered(day: string, reordered: ScheduleBlock[]) {
    queryClient.setQueryData<ScheduleBlock[]>(
      ['weekly_schedule', currentWeekKey],
      (prev) => {
        if (!prev) return reordered;
        return [...prev.filter((b) => b.day !== day), ...reordered].sort(
          (a, b) => a.sort_order - b.sort_order
        );
      }
    );
  }
</script>

<svelte:head><title>This Week — TaskpadSvel</title></svelte:head>

<div class="flex flex-col h-full">
  <!-- Week navigation header -->
  <div class="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
    <button
      onclick={() => weekOffset.update((n) => n - 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      <ChevronLeft size={16} />
    </button>
    <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100 min-w-[160px] text-center">
      {weekLabel(currentWeekKey)}
    </span>
    <button
      onclick={() => weekOffset.update((n) => n + 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      <ChevronRight size={16} />
    </button>
    {#if $weekOffset !== 0}
      <button
        onclick={() => weekOffset.set(0)}
        class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1"
      >
        This week
      </button>
    {/if}
    <div class="flex-1"></div>
    {#if isPastWeek}
      <span class="text-xs text-zinc-400 italic">Archived Week — Read Only</span>
    {:else}
      <button
        onclick={generateSchedule}
        disabled={generating}
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={12} class={generating ? 'animate-spin' : ''} />
        {generating ? 'Generating…' : 'Regenerate'}
      </button>
    {/if}
  </div>

  <!-- Main content -->
  <div class="flex-1 overflow-auto">
    {#if isPastWeek}
      <!-- Past week: read from snapshot -->
      {#if snapshotQuery.isLoading}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400">Loading…</div>
      {:else if !snapshotQuery.data}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400 italic">
          No snapshot found for this week.
        </div>
      {:else}
        <div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left: Planner notes -->
          <div class="flex flex-col gap-4">
            <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Planner Notes
            </h3>
            {#each DAY_NAMES as day, i}
              <DayCard
                weekKey={currentWeekKey}
                {day}
                initialContent={getPastPlannerNote(day)}
                isToday={false}
                readonly={true}
              />
            {/each}
          </div>

          <!-- Right: Tasks -->
          <div class="flex flex-col gap-4">
            <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Tasks
            </h3>
            {#each getPastTasks() as task (task.id)}
              <div
                class="flex items-center gap-2 px-3 py-2 rounded-md border text-sm
                  {task.completed
                    ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 text-zinc-400 line-through'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'}"
              >
                <span class="text-xs text-zinc-400 font-mono uppercase">[{task.type}]</span>
                {task.title}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <!-- Current/future week: editable planner + AI schedule -->
      <div class="p-6 grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-8">
        <!-- Left: Daily planner notes -->
        <div class="flex flex-col gap-4">
          <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Daily Planner
          </h3>
          {#if planQuery.isLoading}
            <div class="text-sm text-zinc-400">Loading…</div>
          {:else}
            {#each DAY_NAMES as day, i}
              <DayCard
                weekKey={currentWeekKey}
                {day}
                initialContent={getPlanContent(day)}
                isToday={isToday(i)}
                readonly={false}
              />
            {/each}
          {/if}
        </div>

        <!-- Right: AI schedule blocks -->
        <div class="flex flex-col gap-4">
          <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            AI Schedule
          </h3>
          {#if scheduleQuery.isLoading}
            <div class="text-sm text-zinc-400">Loading…</div>
          {:else if (scheduleQuery.data ?? []).length === 0 && !generating}
            <div class="text-sm text-zinc-400 italic py-4">
              No schedule yet. Click "Regenerate" to create one.
            </div>
          {:else if generating}
            <div class="flex items-center gap-2 text-sm text-zinc-400 py-4">
              <RefreshCw size={14} class="animate-spin" />
              Generating schedule with AI…
            </div>
          {:else}
            <div class="flex flex-col gap-6">
              {#each DAY_NAMES as day}
                {#if getBlocksForDay(day).length > 0}
                  <ScheduleDay
                    {day}
                    blocks={getBlocksForDay(day)}
                    readonly={false}
                    {onBlocksReordered}
                  />
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
