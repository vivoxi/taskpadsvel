<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery } from '@tanstack/svelte-query';
  import { apiJson, canUseClientApi } from '$lib/client/api';
  import { Card, EmptyState, PageTitle, SectionHeader } from '$lib/components/ui';
  import {
    getMonthlyInstanceStatusStorageKey,
    getMonthlyInstancesStorageKey,
    getWeeklyInstanceStatusStorageKey,
    getWeeklyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import {
    Activity,
    ArrowUpRight,
    Calendar,
    CalendarDays,
    Clock3,
    Target
  } from 'lucide-svelte';
  import { summarizeInstances, summarizeSnapshot, summarizeTasks } from '$lib/periodSummary';
  import { authPassword } from '$lib/stores';
  import {
    getBoardMonthKeyForWeek,
    getBoardWeekOfMonth,
    getWeekKey
  } from '$lib/weekUtils';
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
    href: string;
  };

  const currentWeekKey = getWeekKey();
  const currentMonthKey = getBoardMonthKeyForWeek(currentWeekKey);
  const currentWeekOfMonth = getBoardWeekOfMonth(currentWeekKey, currentMonthKey);
  const canAccessApi = $derived(canUseClientApi($authPassword));

  const tasksQuery = createQuery(() => ({
    queryKey: ['dashboard', 'tasks'] as const,
    queryFn: async () => apiJson<Task[]>('/api/tasks'),
    enabled: browser && canAccessApi
  }));

  const scheduleQuery = createQuery(() => ({
    queryKey: ['dashboard', 'weekly_schedule', currentWeekKey] as const,
    queryFn: async () =>
      apiJson<ScheduleBlock[]>(`/api/weekly-schedule?weekKey=${encodeURIComponent(currentWeekKey)}`),
    enabled: browser && canAccessApi
  }));

  const weeklyInstancesQuery = createQuery(() => ({
    queryKey: ['dashboard', 'period_instances', 'weekly', currentWeekKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getWeeklyInstancesStorageKey(currentWeekKey))}`
      );
      return parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? [];
    },
    enabled: browser && canAccessApi
  }));

  const weeklyStatusQuery = createQuery(() => ({
    queryKey: ['dashboard', 'period_status', 'weekly', currentWeekKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(
          getWeeklyInstanceStatusStorageKey(currentWeekKey)
        )}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi
  }));

  const monthlyInstancesQuery = createQuery(() => ({
    queryKey: ['dashboard', 'period_instances', 'monthly', currentMonthKey, currentWeekOfMonth] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getMonthlyInstancesStorageKey(currentMonthKey))}`
      );
      return (parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? []).filter(
        (instance) => instance.preferred_week_of_month === currentWeekOfMonth
      );
    },
    enabled: browser && canAccessApi
  }));

  const monthlyStatusQuery = createQuery(() => ({
    queryKey: ['dashboard', 'period_status', 'monthly', currentMonthKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(
          getMonthlyInstanceStatusStorageKey(currentMonthKey)
        )}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi
  }));

  const latestWeeklySnapshotQuery = createQuery(() => ({
    queryKey: ['dashboard', 'latest_snapshot', 'weekly'] as const,
    queryFn: async () => apiJson<HistorySnapshot | null>('/api/snapshots?periodType=weekly&latest=true'),
    enabled: browser && canAccessApi
  }));

  const latestMonthlySnapshotQuery = createQuery(() => ({
    queryKey: ['dashboard', 'latest_snapshot', 'monthly'] as const,
    queryFn: async () => apiJson<HistorySnapshot | null>('/api/snapshots?periodType=monthly&latest=true'),
    enabled: browser && canAccessApi
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

  function toDashboardMetrics(summary: ReturnType<typeof summarizeInstances>) {
    return {
      completed: summary.completedTasks,
      total: summary.totalTasks,
      percentage: summary.completionPercentage,
      plannedHours: summary.plannedHours
    };
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

  const weeklyMetrics = $derived(
    toDashboardMetrics(
      summarizeInstances(
        (weeklyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
        weeklyStatusQuery.data ?? []
      )
    )
  );
  const monthlyMetrics = $derived(
    toDashboardMetrics(
      summarizeInstances(
        (monthlyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
        monthlyStatusQuery.data ?? []
      )
    )
  );
  const randomMetrics = $derived(getCompletionMetrics('random'));
  const weeklyHours = $derived({ plannedHours: weeklyMetrics.plannedHours });
  const monthlyHours = $derived({ plannedHours: monthlyMetrics.plannedHours });
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
      weeklyInstancesQuery.isLoading ||
      weeklyStatusQuery.isLoading ||
      monthlyInstancesQuery.isLoading ||
      monthlyStatusQuery.isLoading
  );
  const hasError = $derived(
    Boolean(
      tasksQuery.error ||
        scheduleQuery.error ||
        weeklyInstancesQuery.error ||
        weeklyStatusQuery.error ||
        monthlyInstancesQuery.error ||
        monthlyStatusQuery.error
    )
  );
  const archiveHasError = $derived(
    Boolean(latestWeeklySnapshotQuery.error || latestMonthlySnapshotQuery.error)
  );
  const latestWeeklySummary = $derived(summarizeSnapshot(latestWeeklySnapshotQuery.data));
  const latestMonthlySummary = $derived(summarizeSnapshot(latestMonthlySnapshotQuery.data));
  const focusTasks = $derived(
    [
      ...(weeklyInstancesQuery.data ?? []),
      ...(monthlyInstancesQuery.data ?? [])
    ]
      .filter((instance) => {
        const completedKeys =
          instance.period_type === 'monthly'
            ? (monthlyStatusQuery.data ?? [])
            : (weeklyStatusQuery.data ?? []);
        return !completedKeys.includes(instance.instance_key);
      })
      .sort((a, b) => {
        const aDay = a.preferred_day ?? 'ZZZ';
        const bDay = b.preferred_day ?? 'ZZZ';
        return (
          aDay.localeCompare(bDay, 'tr') ||
          (b.estimated_hours ?? 1) - (a.estimated_hours ?? 1)
        );
      })
      .slice(0, 3)
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
      railClass: 'bg-orange-400 dark:bg-orange-400',
      href: '/thisweek'
    },
    {
      title: 'This Month',
      eyebrow: 'Long-cycle work',
      percentage: monthlyMetrics.percentage,
      completed: monthlyMetrics.completed,
      total: monthlyMetrics.total,
      icon: Calendar,
      shellClass:
        'border-sky-200/80 bg-sky-50/90 dark:border-sky-500/20 dark:bg-sky-950/18',
      glowClass: '',
      railClass: 'bg-sky-400 dark:bg-sky-400',
      href: '/thismonth'
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
      railClass: 'bg-emerald-400 dark:bg-emerald-400',
      href: '/thisweek'
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
      railClass: 'bg-zinc-500 dark:bg-zinc-400',
      href: '/random'
    }
  ]);
</script>

<svelte:head>
  <title>Dashboard — TaskpadSvel</title>
</svelte:head>

<div class="min-h-full px-[var(--space-xl)] py-[var(--space-xl)]">
  <div class="mx-auto flex max-w-6xl flex-col gap-[var(--space-lg)]">
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
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{weeklyHours.plannedHours}h</div>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div class="h-full rounded-full bg-orange-400 transition-all" style={`width: ${weeklyMetrics.percentage}%`}></div>
              </div>
              <div class="mt-1 text-[11px] text-zinc-400">{weeklyMetrics.completed}/{weeklyMetrics.total} done</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Monthly Load</div>
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{monthlyHours.plannedHours}h</div>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div class="h-full rounded-full bg-sky-400 transition-all" style={`width: ${monthlyMetrics.percentage}%`}></div>
              </div>
              <div class="mt-1 text-[11px] text-zinc-400">{monthlyMetrics.completed}/{monthlyMetrics.total} done</div>
            </div>
            <div class="rounded-[20px] border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Schedule Blocks</div>
              <div class="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{scheduleMetrics.total}</div>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div class="h-full rounded-full bg-emerald-400 transition-all" style={`width: ${scheduleMetrics.percentage}%`}></div>
              </div>
              <div class="mt-1 text-[11px] text-zinc-400">{scheduleMetrics.completed}/{scheduleMetrics.total} done</div>
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

    <Card class="border-zinc-700 bg-zinc-800/60">
      <div class="flex flex-col gap-3">
        <SectionHeader>Su an odaklan</SectionHeader>
        {#if focusTasks.length > 0}
          <div class="flex flex-col gap-1.5">
            {#each focusTasks as task (task.instance_key)}
              <div class="flex items-center gap-2 py-1.5">
                <div class="h-1.5 w-1.5 rounded-full bg-zinc-500"></div>
                <span class="text-sm text-zinc-300">{task.title}</span>
              </div>
            {/each}
          </div>
        {:else}
          <EmptyState
            class="py-8"
            message="Su an icin odak listesi bos."
          />
        {/if}
      </div>
    </Card>

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
          <a href={card.href} class={`group relative cursor-pointer overflow-hidden rounded-[26px] border p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.42)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] ${card.shellClass}`}>
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
                <div class="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-zinc-400">
                  <span>Aktif ilerleme</span>
                  <ArrowUpRight size={14} class="text-zinc-600 transition-colors duration-150 group-hover:text-zinc-400" />
                </div>
                <div class="h-2.5 overflow-hidden rounded-full bg-white/80 dark:bg-black/20">
                  <div class={`h-full rounded-full ${card.railClass}`} style={`width: ${card.percentage}%`}></div>
                </div>
                <div class="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{card.completed} tamamlandi</span>
                  <span>{card.total} toplam</span>
                </div>
              </div>
            </div>
          </a>
        {/each}
      </section>

      <article class="rounded-[28px] border border-zinc-200 bg-white/95 p-6 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.38)] dark:border-zinc-800 dark:bg-zinc-950/90">
          <SectionHeader>Gecmis Donemler</SectionHeader>
          <div class="mt-6 space-y-4">
            <div class="rounded-[22px] border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">Weekly Archive</div>
              {#if latestWeeklySnapshotQuery.isLoading}
                <div class="mt-2 text-sm text-zinc-400">Yukleniyor…</div>
              {:else if latestWeeklySnapshotQuery.data}
                <div class="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {Math.round((latestWeeklySnapshotQuery.data.completion_rate ?? 0) * 100)}%
                </div>
                <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {latestWeeklySnapshotQuery.data.period_label}
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div class="rounded-[14px] border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                    Open tasks: {latestWeeklySummary.openTasks}
                  </div>
                  <div class="rounded-[14px] border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                    {latestWeeklySummary.openHours}h acik
                  </div>
                </div>
              {:else}
                <div class="mt-2 text-sm text-zinc-400">Henuz weekly arsiv yok.</div>
              {/if}
            </div>

            <div class="rounded-[22px] border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="text-xs uppercase tracking-[0.18em] text-zinc-400">Monthly Archive</div>
              {#if latestMonthlySnapshotQuery.isLoading}
                <div class="mt-2 text-sm text-zinc-400">Yukleniyor…</div>
              {:else if latestMonthlySnapshotQuery.data}
                <div class="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {Math.round((latestMonthlySnapshotQuery.data.completion_rate ?? 0) * 100)}%
                </div>
                <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {latestMonthlySnapshotQuery.data.period_label}
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div class="rounded-[14px] border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                    Open tasks: {latestMonthlySummary.openTasks}
                  </div>
                  <div class="rounded-[14px] border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                    {latestMonthlySummary.openHours}h acik
                  </div>
                </div>
              {:else}
                <div class="mt-2 text-sm text-zinc-400">Henuz monthly arsiv yok.</div>
              {/if}
            </div>

            {#if archiveHasError}
              <div class="rounded-[18px] border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                Arsiv verileri simdilik yuklenemedi, ama canli metrikler gorunuyor.
              </div>
            {/if}
          </div>
      </article>
    {/if}
  </div>
</div>
