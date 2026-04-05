<script lang="ts">
  import { format } from 'date-fns';
  import { Archive, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import { apiJson, apiSendJson, canUseClientApi } from '$lib/client/api';
  import AttachmentChip from '$lib/components/AttachmentChip.svelte';
  import DayCard from '$lib/components/DayCard.svelte';
  import { Card, EmptyState, PageTitle, SectionHeader } from '$lib/components/ui';
  import {
    getMonthlyInstanceStatusStorageKey,
    getMonthlyInstancesStorageKey,
    getWeeklyInstanceStatusStorageKey,
    getWeeklyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    toggleCompletedInstanceKey,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { normalizeScheduleDayBlocks } from '$lib/scheduleLayout';
  import { parseScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import { getTaskAttachmentsForWeek } from '$lib/taskAttachments';
  import { authPassword, weekOffset } from '$lib/stores';
  import {
    DAY_NAMES,
    addWeeks,
    getBoardMonthKeyForWeek,
    getBoardWeekOfMonth,
    getWeekDays,
    getWeekKey,
    weekLabel
  } from '$lib/weekUtils';
  import type { ScheduleBlock, WeeklyPlan, HistorySnapshot, Task, TaskAttachment, TaskType } from '$lib/types';

  const queryClient = useQueryClient();
  const today = new Date();

  weekOffset.set(0);

  const currentWeekKey = $derived(getWeekKey(addWeeks(today, $weekOffset)));
  const isPastWeek = $derived($weekOffset < 0);
  const weekDays = $derived(getWeekDays(currentWeekKey));
  const currentMonthKey = $derived(getBoardMonthKeyForWeek(currentWeekKey));
  const currentWeekOfMonth = $derived(getBoardWeekOfMonth(currentWeekKey, currentMonthKey));
  const canAccessApi = $derived(canUseClientApi($authPassword));
  const weeklyInstanceStatusStorageKey = $derived(
    getWeeklyInstanceStatusStorageKey(currentWeekKey)
  );
  const monthlyInstanceStatusStorageKey = $derived(
    getMonthlyInstanceStatusStorageKey(currentMonthKey)
  );
  let completingInstanceKeys = $state<string[]>([]);

  function isToday(dayIndex: number): boolean {
    if ($weekOffset !== 0) return false;
    return new Date().getDay() === (dayIndex + 1) % 7;
  }

  function getDayDateLabel(day: string): string {
    const index = DAY_NAMES.indexOf(day as (typeof DAY_NAMES)[number]);
    const date = weekDays[index];
    return date ? format(date, 'd MMM') : '';
  }

  const planQuery = createQuery(() => ({
    queryKey: ['weekly_plan', currentWeekKey] as const,
    queryFn: async () =>
      apiJson<WeeklyPlan[]>(`/api/weekly-plan?weekKey=${encodeURIComponent(currentWeekKey)}`),
    enabled: browser && canAccessApi && !isPastWeek
  }));

  function getPlanContent(day: string): string {
    return planQuery.data?.find((p) => p.day === day)?.content ?? '';
  }

  const scheduleQuery = createQuery(() => ({
    queryKey: ['weekly_schedule', currentWeekKey] as const,
    queryFn: async () =>
      apiJson<ScheduleBlock[]>(`/api/weekly-schedule?weekKey=${encodeURIComponent(currentWeekKey)}`),
    enabled: browser && canAccessApi
  }));

  const weeklyInstancesQuery = createQuery(() => ({
    queryKey: ['thisweek_period_instances', 'weekly', currentWeekKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getWeeklyInstancesStorageKey(currentWeekKey))}`
      );
      return parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? [];
    },
    enabled: browser && canAccessApi && !isPastWeek
  }));

  const monthlyInstancesQuery = createQuery(() => ({
    queryKey: [
      'thisweek_period_instances',
      'monthly',
      currentMonthKey,
      currentWeekOfMonth,
      currentWeekKey
    ] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(getMonthlyInstancesStorageKey(currentMonthKey))}`
      );
      return (parsePersistedPeriodInstances(response.entries[0]?.value)?.instances ?? []).filter(
        (instance) => instance.preferred_week_of_month === currentWeekOfMonth
      );
    },
    enabled: browser && canAccessApi && !isPastWeek
  }));

  const weeklyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', 'weekly', weeklyInstanceStatusStorageKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(weeklyInstanceStatusStorageKey)}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi && !isPastWeek
  }));

  const monthlyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', 'monthly', monthlyInstanceStatusStorageKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(monthlyInstanceStatusStorageKey)}`
      );
      return (
        parsePersistedPeriodInstanceStatus(response.entries[0]?.value)?.completedInstanceKeys ?? []
      );
    },
    enabled: browser && canAccessApi && !isPastWeek
  }));

  const currentInstanceTemplateIds = $derived(
    Array.from(
      new Set(
        [
          ...(weeklyInstancesQuery.data ?? []),
          ...(monthlyInstancesQuery.data ?? [])
        ].map((instance) => instance.template_id)
      )
    )
  );
  const currentInstanceTemplateIdsKey = $derived(currentInstanceTemplateIds.join(','));

  const currentInstanceAttachmentsQuery = createQuery(() => ({
    queryKey: ['thisweek_instance_attachments', currentWeekKey, currentInstanceTemplateIdsKey] as const,
    queryFn: async () => {
      return apiJson<TaskAttachment[]>(
        `/api/attachments?taskIds=${encodeURIComponent(
          currentInstanceTemplateIds.join(',')
        )}&weekKey=${encodeURIComponent(currentWeekKey)}`
      );
    },
    enabled: browser && canAccessApi && !isPastWeek && currentInstanceTemplateIds.length > 0
  }));

  function getBlocksForDay(day: string): ScheduleBlock[] {
    return (scheduleQuery.data ?? []).filter((b) => b.day === day);
  }

  function getCurrentInstancesForDay(day: string): PersistedPeriodTaskInstance[] {
    return [
      ...(weeklyInstancesQuery.data ?? []).filter((instance) => instance.preferred_day === day),
      ...(monthlyInstancesQuery.data ?? []).filter((instance) => instance.preferred_day === day)
    ];
  }

  function isCompletionTransitioning(instanceKey: string): boolean {
    return completingInstanceKeys.includes(instanceKey);
  }

  function getActiveInstancesForDay(day: string): PersistedPeriodTaskInstance[] {
    return getCurrentInstancesForDay(day).filter(
      (instance) => !isCurrentInstanceCompleted(instance) || isCompletionTransitioning(instance.instance_key)
    );
  }

  function getCompletedInstancesForDay(day: string): PersistedPeriodTaskInstance[] {
    return getCurrentInstancesForDay(day).filter(
      (instance) => isCurrentInstanceCompleted(instance) && !isCompletionTransitioning(instance.instance_key)
    );
  }

  function getCurrentAttachmentsForInstance(instance: PersistedPeriodTaskInstance): TaskAttachment[] {
    return getTaskAttachmentsForWeek(
      currentInstanceAttachmentsQuery.data ?? [],
      instance.template_id,
      currentWeekKey
    );
  }

  function isCurrentInstanceCompleted(instance: PersistedPeriodTaskInstance): boolean {
    if (instance.period_type === 'monthly') {
      return (monthlyInstanceStatusQuery.data ?? []).includes(instance.instance_key);
    }
    return (weeklyInstanceStatusQuery.data ?? []).includes(instance.instance_key);
  }

  function getInstanceSourceLabel(instance: PersistedPeriodTaskInstance): string {
    const matchedTask = (tasksQuery.data ?? []).find((task) => task.id === instance.template_id);
    if (matchedTask && matchedTask.title && matchedTask.title !== instance.title) {
      return matchedTask.title;
    }

    return `${instance.period_type} template`;
  }

  async function toggleCurrentInstance(instance: PersistedPeriodTaskInstance) {
    const statusStorageKey =
      instance.period_type === 'monthly'
        ? monthlyInstanceStatusStorageKey
        : weeklyInstanceStatusStorageKey;
    const currentKeys =
      instance.period_type === 'monthly'
        ? (monthlyInstanceStatusQuery.data ?? [])
        : (weeklyInstanceStatusQuery.data ?? []);
    const currentlyCompleted = currentKeys.includes(instance.instance_key);
    const { completedInstanceKeys: nextKeys } = toggleCompletedInstanceKey(
      currentKeys,
      instance.instance_key
    );
    const updatedAt = new Date().toISOString();

    if (!currentlyCompleted) {
      completingInstanceKeys = Array.from(new Set([...completingInstanceKeys, instance.instance_key]));
    }

    try {
      await apiSendJson('/api/preferences', 'POST', {
        key: statusStorageKey,
        value: {
          completedInstanceKeys: nextKeys,
          updatedAt
        },
        updatedAt
      });
    } catch {
      completingInstanceKeys = completingInstanceKeys.filter((key) => key !== instance.instance_key);
      toast.error('Failed to update task');
      return;
    }

    if (!currentlyCompleted) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    queryClient.setQueryData(
      ['period_instance_status', instance.period_type, statusStorageKey],
      nextKeys
    );
    completingInstanceKeys = completingInstanceKeys.filter((key) => key !== instance.instance_key);
    queryClient.invalidateQueries({ queryKey: ['period_instance_status', instance.period_type] });
  }

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks_all'] as const,
    queryFn: async () => apiJson<Task[]>('/api/tasks'),
    enabled: browser && canAccessApi && !isPastWeek
  }));

  function getLinkedTaskForBlock(block: ScheduleBlock): { id: string; type: TaskType } | null {
    const details = parseScheduleBlockDetails(block.notes);

    if (details.linkedTaskId) {
      const matchedTask = (tasksQuery.data ?? []).find((task) => task.id === details.linkedTaskId);
      if (matchedTask && (matchedTask.type === 'weekly' || matchedTask.type === 'monthly')) {
        return { id: matchedTask.id, type: matchedTask.type };
      }

      if (details.linkedTaskType) {
        return { id: details.linkedTaskId, type: details.linkedTaskType };
      }
    }

    const fallbackTask = (tasksQuery.data ?? []).find(
      (task) =>
        task.title === block.task_title && (task.type === 'weekly' || task.type === 'monthly')
    );

    return fallbackTask ? { id: fallbackTask.id, type: fallbackTask.type } : null;
  }

  const linkedTaskIds = $derived(
    Array.from(
      new Set(
        (scheduleQuery.data ?? [])
          .map((block) => getLinkedTaskForBlock(block)?.id ?? null)
          .filter((id): id is string => Boolean(id))
      )
    )
  );
  const linkedTaskIdsKey = $derived(linkedTaskIds.join(','));

  const scheduleAttachmentsQuery = createQuery(() => ({
    queryKey: ['schedule_attachments', currentWeekKey, linkedTaskIdsKey] as const,
    queryFn: async () => {
      return apiJson<TaskAttachment[]>(
        `/api/attachments?taskIds=${encodeURIComponent(linkedTaskIds.join(','))}&weekKey=${encodeURIComponent(currentWeekKey)}`
      );
    },
    enabled: browser && canAccessApi && !isPastWeek && linkedTaskIds.length > 0
  }));

  const snapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', currentWeekKey] as const,
    queryFn: async () =>
      apiJson<HistorySnapshot | null>(
        `/api/snapshots?periodType=weekly&periodKey=${encodeURIComponent(currentWeekKey)}`
      ),
    enabled: browser && canAccessApi && isPastWeek
  }));

  function getPastPlannerNote(day: string): string {
    return snapshotQuery.data?.planner_notes?.[day] ?? '';
  }

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  function getPastTasks(): Task[] {
    return [...getPastCompletedTasks(), ...getPastMissedTasks()];
  }

  function getPastCompletedScheduleBlocks(): ScheduleBlock[] {
    return (snapshotQuery.data?.completed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  function getPastMissedScheduleBlocks(): ScheduleBlock[] {
    return (snapshotQuery.data?.missed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  const archiveAttachmentsQuery = createQuery(() => ({
    queryKey: ['archive_attachments', currentWeekKey] as const,
    queryFn: async () => {
      return apiJson<TaskAttachment[]>(
        `/api/attachments?taskIds=${encodeURIComponent(getPastTasks().map((task) => task.id).join(','))}&weekKey=${encodeURIComponent(currentWeekKey)}`
      );
    },
    enabled: browser && canAccessApi && isPastWeek && getPastTasks().length > 0
  }));

  function getPastAttachmentsForTask(taskId: string): TaskAttachment[] {
    return (archiveAttachmentsQuery.data ?? []).filter((attachment) => attachment.task_id === taskId);
  }

  function getPastLinkedTaskIdForBlock(block: ScheduleBlock): string | null {
    const details = parseScheduleBlockDetails(block.notes);
    if (details.linkedTaskId) return details.linkedTaskId;
    return getPastTasks().find((task) => task.title === block.task_title)?.id ?? null;
  }

  function getPastAttachmentsForBlock(block: ScheduleBlock): TaskAttachment[] {
    const taskId = getPastLinkedTaskIdForBlock(block);
    return taskId ? getPastAttachmentsForTask(taskId) : [];
  }

  async function persistBlocks(blocks: ScheduleBlock[]) {
    await Promise.all(
      blocks.map((block) =>
        apiSendJson(`/api/weekly-schedule/${block.id}`, 'PATCH', {
          day: block.day,
          start_time: block.start_time,
          end_time: block.end_time,
          sort_order: block.sort_order
        })
      )
    );
  }

  async function onBlocksReordered(day: string, reordered: ScheduleBlock[]) {
    const normalizedBlocks = normalizeScheduleDayBlocks(day, reordered);
    if (!normalizedBlocks) {
      toast.error('Blocks no longer fit into work hours');
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      return;
    }

    const currentBlocks = (queryClient.getQueryData(['weekly_schedule', currentWeekKey]) ??
      scheduleQuery.data ??
      []) as ScheduleBlock[];

    const nextBlocks = [...currentBlocks.filter((b) => b.day !== day), ...normalizedBlocks];
    queryClient.setQueryData<ScheduleBlock[]>(['weekly_schedule', currentWeekKey], nextBlocks);

    try {
      await persistBlocks(normalizedBlocks);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.error('Failed to update schedule times');
      console.error(err);
    }
  }

  function onBlockUpdated(updated: ScheduleBlock) {
    queryClient.setQueryData<ScheduleBlock[]>(
      ['weekly_schedule', currentWeekKey],
      (prev) => prev?.map((block) => (block.id === updated.id ? updated : block)) ?? []
    );
  }

  function getAttachmentsForBlock(block: ScheduleBlock): TaskAttachment[] {
    const linkedTask = getLinkedTaskForBlock(block);
    if (!linkedTask) return [];
    return getTaskAttachmentsForWeek(scheduleAttachmentsQuery.data ?? [], linkedTask.id, currentWeekKey);
  }

  function onScheduleAttachmentAdded(_: TaskAttachment) {
    queryClient.invalidateQueries({ queryKey: ['schedule_attachments', currentWeekKey] });
    queryClient.invalidateQueries({ queryKey: ['attachments'] });
  }

  function onScheduleAttachmentDeleted(_: string) {
    queryClient.invalidateQueries({ queryKey: ['schedule_attachments', currentWeekKey] });
    queryClient.invalidateQueries({ queryKey: ['attachments'] });
  }

  async function moveBlockToDay(block: ScheduleBlock, targetDay: string) {
    if (targetDay === block.day) return;

    const currentBlocks = (queryClient.getQueryData(['weekly_schedule', currentWeekKey]) ??
      scheduleQuery.data ??
      []) as ScheduleBlock[];

    const sourceDayBlocks = currentBlocks
      .filter((item) => item.day === block.day && item.id !== block.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const targetDayBlocks = currentBlocks
      .filter((item) => item.day === targetDay)
      .sort((a, b) => a.sort_order - b.sort_order);

    const movedBlock = { ...block, day: targetDay, sort_order: targetDayBlocks.length };
    const normalizedSourceDayBlocks = normalizeScheduleDayBlocks(block.day, sourceDayBlocks);
    const normalizedTargetDayBlocks = normalizeScheduleDayBlocks(targetDay, [
      ...targetDayBlocks,
      movedBlock
    ]);

    if (!normalizedSourceDayBlocks || !normalizedTargetDayBlocks) {
      toast.error('Target day has no free work slot for this block');
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      return;
    }

    const untouchedBlocks = currentBlocks.filter(
      (item) => item.day !== block.day && item.day !== targetDay && item.id !== block.id
    );

    const nextBlocks = [...untouchedBlocks, ...normalizedSourceDayBlocks, ...normalizedTargetDayBlocks].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    queryClient.setQueryData<ScheduleBlock[]>(['weekly_schedule', currentWeekKey], nextBlocks);

    try {
      await persistBlocks([...normalizedSourceDayBlocks, ...normalizedTargetDayBlocks]);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.error('Failed to move schedule item');
      console.error(err);
    }
  }

  async function addBlockToDay(
    targetDay: string,
    draft: { start_time: string; end_time: string; task_title: string; notes: string }
  ) {
    const existingBlocks = (scheduleQuery.data ?? []).filter((b) => b.day === targetDay);
    const nextSortOrder = existingBlocks.length > 0
      ? Math.max(...existingBlocks.map((b) => b.sort_order)) + 1
      : 0;

    try {
      await apiSendJson('/api/weekly-schedule', 'POST', {
        week_key: currentWeekKey,
        day: targetDay,
        start_time: draft.start_time,
        end_time: draft.end_time,
        task_title: draft.task_title,
        notes: draft.notes,
        sort_order: nextSortOrder
      });
    } catch {
      toast.error('Failed to add block');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
  }

  async function deleteBlock(blockId: string) {
    try {
      await apiSendJson(`/api/weekly-schedule/${blockId}`, 'DELETE');
    } catch {
      toast.error('Failed to delete block');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
    toast.success('Block deleted');
  }
</script>

<svelte:head><title>This Week — TaskpadSvel</title></svelte:head>

<div class="flex h-full flex-col">
  <!-- Week navigation header -->
  <div class="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6 sm:py-4">
    {#if isPastWeek}
      <div class="mb-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2">
        <Archive size={16} class="text-zinc-500" />
        <span class="text-sm text-zinc-500">
          Bu geçmiş bir haftanın arşividir — salt okunur
        </span>
        <button
          type="button"
          onclick={() => weekOffset.set(0)}
          class="ml-auto text-xs text-zinc-400 underline underline-offset-2 transition-colors duration-150 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400"
        >
          Bu haftaya dön
        </button>
      </div>
    {/if}
    <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-1">
      <button
        onclick={() => weekOffset.update((n) => n - 1)}
        class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span class="whitespace-nowrap px-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
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
    </div>
    {#if isPastWeek}
      <span class="text-xs text-zinc-400 italic">Archived — Read Only</span>
    {:else}
      <a
        href="/thismonth"
        class="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Generate from This Month
      </a>
    {/if}
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-1 overflow-auto">
    {#if isPastWeek}
      <!-- Past week: read from snapshot -->
      {#if snapshotQuery.isLoading}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400">Loading…</div>
      {:else if !snapshotQuery.data}
        <EmptyState message="No snapshot found for this week." />
      {:else}
        <div class="grid grid-cols-1 gap-[var(--space-lg)] p-[var(--space-xl)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <!-- Left: Planner notes -->
          <Card class="bg-zinc-900/80">
            <div class="flex flex-col gap-[var(--space-md)]">
              <div class="flex items-center justify-between gap-3">
                <PageTitle class="text-lg">This Week</PageTitle>
                <SectionHeader>Gunluk Notlar</SectionHeader>
              </div>
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
          </Card>

          <!-- Right: Tasks -->
          <div class="xl:border-l xl:border-zinc-800 xl:pl-[var(--space-lg)]">
          <Card class="bg-zinc-900/35">
            <div class="flex flex-col gap-[var(--space-md)]">
            <SectionHeader>Bu Haftanin Gorevleri</SectionHeader>
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-green-600 dark:text-green-400">
                Completed
              </span>
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
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-zinc-400 font-mono uppercase">[{task.type}]</span>
                        <span>{task.title}</span>
                      </div>
                      {#if getPastAttachmentsForTask(task.id).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForTask(task.id) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <span class="text-xs font-medium text-amber-600 dark:text-amber-400">
                Missed
              </span>
              {#if getPastMissedTasks().length === 0}
                <div class="text-sm text-zinc-400 italic">No missed tasks recorded.</div>
              {:else}
                {#each getPastMissedTasks() as task (task.id)}
                  <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-zinc-400 font-mono uppercase">[{task.type}]</span>
                        <span>{task.title}</span>
                      </div>
                      {#if getPastAttachmentsForTask(task.id).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForTask(task.id) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="flex flex-col gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Schedule
              </span>

              <div class="flex flex-col gap-2">
                <span class="text-xs font-medium text-green-600 dark:text-green-400">
                  Completed Blocks
                </span>
                {#if getPastCompletedScheduleBlocks().length === 0}
                  <div class="text-sm text-zinc-400 italic">No completed schedule blocks recorded.</div>
                {:else}
                  {#each getPastCompletedScheduleBlocks() as block (block.id)}
                    <div class="flex items-start gap-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 px-3 py-2">
                      <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400">
                        <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                          <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          {block.day} · {block.start_time}–{block.end_time}
                        </div>
                        <div class="text-sm text-zinc-500 line-through">{block.task_title}</div>
                        {#if getPastAttachmentsForBlock(block).length > 0}
                          <div class="mt-2 flex flex-wrap gap-2">
                            {#each getPastAttachmentsForBlock(block) as attachment (attachment.id)}
                              <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="flex flex-col gap-2 pt-2">
                <span class="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Missed Blocks
                </span>
                {#if getPastMissedScheduleBlocks().length === 0}
                  <div class="text-sm text-zinc-400 italic">No missed schedule blocks recorded.</div>
                {:else}
                  {#each getPastMissedScheduleBlocks() as block (block.id)}
                    <div class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div class="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {block.day} · {block.start_time}–{block.end_time}
                      </div>
                      <div class="text-sm text-zinc-700 dark:text-zinc-300">{block.task_title}</div>
                      {#if getPastAttachmentsForBlock(block).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForBlock(block) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
            </div>
          </Card>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Current/future week: editable planner + AI schedule -->
      <div class="grid grid-cols-1 gap-[var(--space-lg)] p-[var(--space-xl)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <!-- Left: Daily planner notes -->
        <Card class="bg-zinc-900/80">
          <div class="flex flex-col gap-[var(--space-md)]">
            <div class="flex items-center justify-between gap-3">
              <PageTitle class="text-lg">This Week</PageTitle>
              <SectionHeader>Gunluk Notlar</SectionHeader>
            </div>
            {#if planQuery.isLoading}
              <EmptyState message="Planner notes are loading." />
            {:else}
              {#each DAY_NAMES as day, i}
                <DayCard
                  weekKey={currentWeekKey}
                  {day}
                  dateLabel={getDayDateLabel(day)}
                  initialContent={getPlanContent(day)}
                  isToday={isToday(i)}
                  readonly={false}
                />
              {/each}
            {/if}
          </div>
        </Card>

        <!-- Right: weekly schedule blocks -->
        <div class="xl:border-l xl:border-zinc-800 xl:pl-[var(--space-lg)]">
        <Card class="bg-zinc-900/35">
          <div class="flex flex-col gap-[var(--space-md)]">
          <SectionHeader>Bu Haftanin Gorevleri</SectionHeader>
          {#if weeklyInstancesQuery.isLoading || monthlyInstancesQuery.isLoading}
            <EmptyState message="Haftalik gorevler yukleniyor." />
          {:else if [...(weeklyInstancesQuery.data ?? []), ...(monthlyInstancesQuery.data ?? [])].length === 0}
            <EmptyState
              message="No weekly execution plan yet."
              actionLabel="This Month'a git"
              onAction={() => {
                window.location.href = '/thismonth';
              }}
            />
          {:else}
            <div class="flex flex-col gap-6">
              {#each DAY_NAMES as day, i}
                {@const activeInstances = getActiveInstancesForDay(day)}
                {@const completedInstances = getCompletedInstancesForDay(day)}
                {#if activeInstances.length > 0 || completedInstances.length > 0}
                  {@const todayDay = isToday(i)}
                  <div class={`flex flex-col gap-3 rounded-xl border p-4 ${
                    todayDay
                      ? 'border-zinc-500 bg-zinc-800/70'
                      : 'border-zinc-800 bg-zinc-900/30'
                  }`}>
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                      <h4 class={`text-xs font-medium ${todayDay ? 'text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {day}
                      </h4>
                      <span class="text-xs text-zinc-400 dark:text-zinc-500">
                        {getDayDateLabel(day)}
                      </span>
                      </div>
                      {#if todayDay}
                        <span class="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                          Bugun
                        </span>
                      {/if}
                    </div>
                    <div class="flex flex-col gap-2">
                      {#each activeInstances as instance (instance.instance_key)}
                        <button
                          type="button"
                          onclick={() => toggleCurrentInstance(instance)}
                          class={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-300 ${
                            isCompletionTransitioning(instance.instance_key)
                              ? 'opacity-40'
                              : 'opacity-100'
                          } ${
                            instance.period_type === 'monthly'
                              ? 'border-sky-200 bg-sky-50/70 dark:border-sky-500/20 dark:bg-sky-950/15'
                              : 'border-violet-200 bg-violet-50/70 dark:border-violet-500/20 dark:bg-violet-950/15'
                          }`}
                        >
                          <span
                            class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              isCurrentInstanceCompleted(instance)
                                ? 'border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400'
                                : 'border-zinc-300 dark:border-zinc-600'
                            }`}
                          >
                            {#if isCurrentInstanceCompleted(instance)}
                              <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                                <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            {/if}
                          </span>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                              <span class="font-mono text-[10px] uppercase text-zinc-400">
                                [{instance.period_type}]
                              </span>
                              <span
                                class="text-sm font-medium text-zinc-900 dark:text-zinc-100"
                              >
                                {instance.title}
                              </span>
                              <span class="ml-auto text-xs text-zinc-600 dark:text-zinc-500">
                                ↩ {getInstanceSourceLabel(instance)}
                              </span>
                            </div>
                            <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {instance.estimated_hours ?? 1}h
                            </div>
                            {#if getCurrentAttachmentsForInstance(instance).length > 0}
                              <div class="mt-2 flex flex-wrap gap-2">
                                {#each getCurrentAttachmentsForInstance(instance) as attachment (attachment.id)}
                                  <AttachmentChip
                                    {attachment}
                                    readonly={true}
                                    onDelete={() => {}}
                                  />
                                {/each}
                              </div>
                            {/if}
                          </div>
                        </button>
                      {/each}
                      {#if completedInstances.length > 0}
                        <div class="pt-2">
                          <div class="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
                            Done
                          </div>
                          <div class="flex flex-col gap-2">
                            {#each completedInstances as instance (instance.instance_key)}
                              <button
                                type="button"
                                onclick={() => toggleCurrentInstance(instance)}
                                class="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 px-3 py-3 text-left opacity-40 transition-all duration-300 dark:border-emerald-500/20 dark:bg-emerald-950/15"
                              >
                                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400">
                                  <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                                    <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                  </svg>
                                </span>
                                <div class="min-w-0 flex-1">
                                  <div class="flex items-center gap-2">
                                    <span class="font-mono text-[10px] uppercase text-zinc-400">
                                      [{instance.period_type}]
                                    </span>
                                    <span class="text-sm font-medium text-zinc-400 line-through">
                                      {instance.title}
                                    </span>
                                    <span class="ml-auto text-xs text-zinc-600 dark:text-zinc-500">
                                      ↩ {getInstanceSourceLabel(instance)}
                                    </span>
                                  </div>
                                  <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    {instance.estimated_hours ?? 1}h
                                  </div>
                                  {#if getCurrentAttachmentsForInstance(instance).length > 0}
                                    <div class="mt-2 flex flex-wrap gap-2">
                                      {#each getCurrentAttachmentsForInstance(instance) as attachment (attachment.id)}
                                        <AttachmentChip
                                          {attachment}
                                          readonly={true}
                                          onDelete={() => {}}
                                        />
                                      {/each}
                                    </div>
                                  {/if}
                                </div>
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
          </div>
        </Card>
        </div>
      </div>
    {/if}
  </div>
</div>
