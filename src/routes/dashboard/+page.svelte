<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery } from '@tanstack/svelte-query';
  import {
    Activity,
    ArrowUpRight,
    Calendar,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Target
  } from 'lucide-svelte';
  import { supabase } from '$lib/supabase';
  import { getWeekKey } from '$lib/weekUtils';
  import { parseScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import type { HistorySnapshot, ScheduleBlock, Task, TaskType } from '$lib/types';

  type MetricCard = {
    title: string;
    eyebrow: string;
    percentage: number;
    completed: number;
    total: number;
    icon: typeof CalendarDays;
    shellClass: string;
    glowClass: string;
    railClass: string;
  };

  const currentWeekKey = getWeekKey();

  const tasksQuery = createQuery(() => ({
    queryKey: ['dashboard', 'tasks'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser
  }));

  const scheduleQuery = createQuery(() => ({
    queryKey: ['dashboard', 'weekly_schedule', currentWeekKey] as const,
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

  const latestWeeklySnapshotQuery = createQuery(() => ({
    queryKey: ['dashboard', 'latest_snapshot', 'weekly'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'weekly')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as HistorySnapshot | null;
    },
    enabled: browser
  }));

  const latestMonthlySnapshotQuery = createQuery(() => ({
    queryKey: ['dashboard', 'latest_snapshot', 'monthly'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'monthly')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as HistorySnapshot | null;
    },
    enabled: browser
  }));

  function getTasksByType(type: TaskType): Task[] {
    return (tasksQuery.data ?? []).filter((task) => task.type === type);
  }

  function getCompletionMetrics(type: TaskType) {
    const tasks = getTasksByType(type);
    const completed = tasks.filter((task) => task.completed).length;
    const total = tasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  function getScheduleMetrics() {
    const blocks = scheduleQuery.data ?? [];
    const completed = blocks.filter((block) => parseScheduleBlockDetails(block.notes).completed).length;
    const total = blocks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  function progressTone(percentage: number) {
    if (percentage >= 80) return 'bg-emerald-400';
    if (percentage >= 50) return 'bg-orange-400';
    return 'bg-zinc-400';
  }

  function progressLabel(percentage: number) {
    if (percentage >= 80) return 'Strong cadence';
    if (percentage >= 50) return 'On track';
    return 'Needs focus';
  }

  const weeklyMetrics = $derived(getCompletionMetrics('weekly'));
  const monthlyMetrics = $derived(getCompletionMetrics('monthly'));
  const randomMetrics = $derived(getCompletionMetrics('random'));
  const scheduleMetrics = $derived(getScheduleMetrics());
  const totalCompleted = $derived(
    weeklyMetrics.completed + monthlyMetrics.completed + randomMetrics.completed
  );
  const totalTasks = $derived(
    weeklyMetrics.total + monthlyMetrics.total + randomMetrics.total
  );
  const overallPercentage = $derived(totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0);
  const loading = $derived(
    tasksQuery.isLoading ||
      scheduleQuery.isLoading ||
      latestWeeklySnapshotQuery.isLoading ||
      latestMonthlySnapshotQuery.isLoading
  );
  const hasError = $derived(
    Boolean(
      tasksQuery.error ||
        scheduleQuery.error ||
        latestWeeklySnapshotQuery.error ||
      latestMonthlySnapshotQuery.error
    )
  );
  const metricCards = $derived<MetricCard[]>([
    {
      title: 'Weekly',
      eyebrow: 'Recurring load',
      percentage: weeklyMetrics.percentage,
      completed: weeklyMetrics.completed,
      total: weeklyMetrics.total,
      icon: CalendarDays,
      shellClass:
        'border-orange-200/80 bg-orange-50/90 dark:border-orange-500/20 dark:bg-orange-950/18',
      glowClass: '',
      railClass: 'bg-orange-400 dark:bg-orange-400'
    },
    {
      title: 'Monthly',
      eyebrow: 'Long-cycle work',
      percentage: monthlyMetrics.percentage,
      completed: monthlyMetrics.completed,
      total: monthlyMetrics.total,
      icon: Calendar,
      shellClass:
        'border-sky-200/80 bg-sky-50/90 dark:border-sky-500/20 dark:bg-sky-950/18',
      glowClass: '',
      railClass: 'bg-sky-400 dark:bg-sky-400'
    },
    {
      title: 'This Week Schedule',
      eyebrow: 'Execution blocks',
      percentage: scheduleMetrics.percentage,
      completed: scheduleMetrics.completed,
      total: scheduleMetrics.total,
      icon: Clock3,
      shellClass:
        'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-500/20 dark:bg-emerald-950/18',
      glowClass: '',
      railClass: 'bg-emerald-400 dark:bg-emerald-400'
    },
    {
      title: 'Random',
      eyebrow: 'Loose ends',
      percentage: randomMetrics.percentage,
      completed: randomMetrics.completed,
      total: randomMetrics.total,
      icon: Target,
      shellClass:
        'border-zinc-300/80 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-900/85',
      glowClass: '',
      railClass: 'bg-zinc-500 dark:bg-zinc-400'
    }
  ]);
</script>

<svelte:head>
  <title>Dashboard — TaskpadSvel</title>
</svelte:head>

<div class="min-h-full px-4 py-6 sm:px-6 sm:py-8">
  <div class="mx-auto flex max-w-6xl flex-col gap-8">
    <section class="relative overflow-hidden rounded-[30px] border border-zinc-200/80 bg-white/95 p-6 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.38)] sm:p-8 dark:border-zinc-800 dark:bg-zinc-950/85">
      <div class="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="flex flex-col gap-4">
          <div class="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
            <Activity size={12} />
            Operations Pulse
          </div>
          <div class="max-w-2xl">
            <h1 class="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
              Weekly ve monthly islerin anlik tamamlama yuzdesi
            </h1>
            <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Bu ekran, su an acik task listelerindeki ilerlemeyi ve son arsivlenen donemlerin kapanis oranlarini tek bakista gosterir.
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Weekly Load</div>
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{weeklyMetrics.total}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Monthly Load</div>
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{monthlyMetrics.total}</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Schedule Blocks</div>
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{scheduleMetrics.total}</div>
            </div>
          </div>
        </div>

        <div class="relative overflow-hidden rounded-[26px] border border-zinc-900 bg-zinc-950 p-6 text-zinc-50">
          <div class="absolute right-4 top-4 rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Live
          </div>
          <div class="relative flex h-full flex-col justify-between gap-8">
            <div class="space-y-3">
              <div class="text-xs uppercase tracking-[0.22em] text-zinc-500">Overall velocity</div>
              <div class="text-5xl font-semibold leading-none sm:text-6xl">{overallPercentage}%</div>
              <div class="flex items-center gap-2 text-sm text-zinc-400">
                <ArrowUpRight size={14} />
                {totalCompleted} / {totalTasks} task tamamlandi
              </div>
            </div>
            <div class="space-y-3">
              <div class="h-3 overflow-hidden rounded-full bg-white/8">
                <div class="h-full rounded-full bg-orange-400 transition-all" style={`width: ${overallPercentage}%`}></div>
              </div>
              <div class="grid grid-cols-2 gap-3 text-xs text-zinc-400">
                <div class="rounded-[18px] border border-white/8 bg-white/4 px-3 py-3">
                  <div class="uppercase tracking-[0.18em] text-zinc-500">Weekly</div>
                  <div class="mt-1 text-lg font-semibold text-zinc-100">{weeklyMetrics.percentage}%</div>
                </div>
                <div class="rounded-[18px] border border-white/8 bg-white/4 px-3 py-3">
                  <div class="uppercase tracking-[0.18em] text-zinc-500">Monthly</div>
                  <div class="mt-1 text-lg font-semibold text-zinc-100">{monthlyMetrics.percentage}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {#if hasError}
      <div class="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        Dashboard verisi yuklenemedi.
      </div>
    {:else if loading}
      <div class="rounded-3xl border border-zinc-200 bg-white/80 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
        Dashboard yukleniyor…
      </div>
    {:else}
      <section class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {#each metricCards as card (card.title)}
          <article class={`group relative overflow-hidden rounded-[26px] border p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.42)] transition-transform duration-200 hover:-translate-y-0.5 ${card.shellClass}`}>
            <div class="relative flex h-full flex-col gap-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-[11px] uppercase tracking-[0.22em] text-zinc-400">{card.eyebrow}</div>
                  <h2 class="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{card.title}</h2>
                </div>
                <div class="rounded-[18px] border border-black/5 bg-white/70 p-3 text-zinc-700 shadow-sm dark:border-white/8 dark:bg-white/6 dark:text-zinc-100">
                  <card.icon size={18} />
                </div>
              </div>

              <div class="flex items-end justify-between gap-3">
                <div class="text-5xl font-semibold leading-none tracking-tight text-zinc-950 dark:text-zinc-50">
                  {card.percentage}%
                </div>
                <div class="rounded-full border border-black/6 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:border-white/8 dark:bg-white/6 dark:text-zinc-300">
                  {progressLabel(card.percentage)}
                </div>
              </div>

              <div class="space-y-3">
                <div class="h-2.5 overflow-hidden rounded-full bg-white/80 dark:bg-black/20">
                  <div class={`h-full rounded-full ${card.railClass}`} style={`width: ${card.percentage}%`}></div>
                </div>
                <div class="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{card.completed} tamamlandi</span>
                  <span>{card.total} toplam</span>
                </div>
              </div>
            </div>
          </article>
        {/each}
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <article class="rounded-[28px] border border-zinc-200 bg-white/95 p-6 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.38)] dark:border-zinc-800 dark:bg-zinc-950/90">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Current Progress</h2>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Weekly ve monthly task listelerinin su anki oranlari
              </p>
            </div>
            <div class="rounded-2xl bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
              Live
            </div>
          </div>

          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div class="rounded-[22px] border border-orange-200/80 bg-orange-50/90 p-5 dark:border-orange-500/20 dark:bg-orange-950/18">
              <div class="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <CheckCircle2 size={16} />
                Weekly Tasks
              </div>
              <div class="mt-4 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                {weeklyMetrics.completed}<span class="text-zinc-400">/{weeklyMetrics.total}</span>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-zinc-950">
                <div class="h-full rounded-full bg-orange-400" style={`width: ${weeklyMetrics.percentage}%`}></div>
              </div>
            </div>

            <div class="rounded-[22px] border border-sky-200/80 bg-sky-50/90 p-5 dark:border-sky-500/20 dark:bg-sky-950/18">
              <div class="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <CheckCircle2 size={16} />
                Monthly Tasks
              </div>
              <div class="mt-4 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
                {monthlyMetrics.completed}<span class="text-zinc-400">/{monthlyMetrics.total}</span>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-zinc-950">
                <div class="h-full rounded-full bg-sky-400" style={`width: ${monthlyMetrics.percentage}%`}></div>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[28px] border border-zinc-200 bg-white/95 p-6 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.38)] dark:border-zinc-800 dark:bg-zinc-950/90">
          <h2 class="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Last Archived Results</h2>
          <div class="mt-6 space-y-4">
            <div class="rounded-[22px] border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">Weekly Archive</div>
              {#if latestWeeklySnapshotQuery.data}
                <div class="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {Math.round((latestWeeklySnapshotQuery.data.completion_rate ?? 0) * 100)}%
                </div>
                <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {latestWeeklySnapshotQuery.data.period_label}
                </div>
              {:else}
                <div class="mt-2 text-sm text-zinc-400">Henuz weekly arsiv yok.</div>
              {/if}
            </div>

            <div class="rounded-[22px] border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">Monthly Archive</div>
              {#if latestMonthlySnapshotQuery.data}
                <div class="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {Math.round((latestMonthlySnapshotQuery.data.completion_rate ?? 0) * 100)}%
                </div>
                <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {latestMonthlySnapshotQuery.data.period_label}
                </div>
              {:else}
                <div class="mt-2 text-sm text-zinc-400">Henuz monthly arsiv yok.</div>
              {/if}
            </div>
          </div>
        </article>
      </section>
    {/if}
  </div>
</div>
