<script lang="ts">
  import { page } from '$app/stores';
  import { format } from 'date-fns';
  import { Archive, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import { apiJson, apiSendJson, canUseClientApi } from '$lib/client/api';
  import AttachmentChip from '$lib/components/AttachmentChip.svelte';
  import DayCard from '$lib/components/DayCard.svelte';
  import ThisWeekDayStack from '$lib/components/ThisWeekDayStack.svelte';
  import ThisWeekInstanceButton from '$lib/components/ThisWeekInstanceButton.svelte';
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
  import { authPassword } from '$lib/stores';
  import {
    DAY_NAMES,
    getBoardMonthKeyForWeek,
    getBoardWeekOfMonth,
    getNextWeekKey,
    getPreviousWeekKey,
    getWeekDays,
    getWeekKey,
    normalizeWeekKeyParam,
    weekLabel
  } from '$lib/weekUtils';
  import type { ScheduleBlock, WeeklyPlan, HistorySnapshot, Task, TaskAttachment, TaskType } from '$lib/types';

  const queryClient = useQueryClient();
  const todayWeekKey = getWeekKey();
  const currentWeekKey = $derived(
    normalizeWeekKeyParam($page.url.searchParams.get('week'), todayWeekKey)
  );
  const isCurrentWeek = $derived(currentWeekKey === todayWeekKey);
  const currentWeekHref = '/thisweek';
  const previousWeekHref = $derived(`/thisweek?week=${getPreviousWeekKey(currentWeekKey)}`);
  const nextWeekHref = $derived(`/thisweek?week=${getNextWeekKey(currentWeekKey)}`);
  const isPastWeek = $derived(
    (getWeekDays(currentWeekKey)[0]?.getTime() ?? 0) <
      (getWeekDays(todayWeekKey)[0]?.getTime() ?? 0)
  );
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
    if (!isCurrentWeek) return false;
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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi && currentInstanceTemplateIds.length > 0
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

  function getTodayDayName(): (typeof DAY_NAMES)[number] | null {
    if (!isCurrentWeek) return null;
    return DAY_NAMES[(new Date().getDay() + 6) % 7] ?? null;
  }

  function getPlannerDays(): (typeof DAY_NAMES)[number][] {
    const todayDay = getTodayDayName();
    return DAY_NAMES.filter((day) => day !== todayDay);
  }

  function getTodayOpenInstances(): PersistedPeriodTaskInstance[] {
    const todayDay = getTodayDayName();
    return todayDay ? getActiveInstancesForDay(todayDay) : [];
  }

  function getTodayCompletedInstances(): PersistedPeriodTaskInstance[] {
    const todayDay = getTodayDayName();
    return todayDay ? getCompletedInstancesForDay(todayDay) : [];
  }

  function getCurrentWeekOpenCount(): number {
    return DAY_NAMES.reduce((sum, day) => sum + getActiveInstancesForDay(day).length, 0);
  }

  function getCurrentWeekCompletedCount(): number {
    return DAY_NAMES.reduce((sum, day) => sum + getCompletedInstancesForDay(day).length, 0);
  }

  type CurrentWeekSection = {
    day: (typeof DAY_NAMES)[number];
    dateLabel: string;
    isToday: boolean;
    activeInstances: PersistedPeriodTaskInstance[];
    completedInstances: PersistedPeriodTaskInstance[];
  };

  const currentWeekSections = $derived<CurrentWeekSection[]>(
    DAY_NAMES.map((day, index) => ({
      day,
      dateLabel: getDayDateLabel(day),
      isToday: isToday(index),
      activeInstances: getActiveInstancesForDay(day),
      completedInstances: getCompletedInstancesForDay(day)
    })).filter((section) => section.activeInstances.length > 0 || section.completedInstances.length > 0)
  );

  const todaySection = $derived(
    currentWeekSections.find((section) => section.isToday) ?? null
  );

  const remainingWeekSections = $derived(
    currentWeekSections.filter((section) => !section.isToday)
  );

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
    enabled: browser && canAccessApi
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
    enabled: browser && canAccessApi && linkedTaskIds.length > 0
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
    return getPlanContent(day) || snapshotQuery.data?.planner_notes?.[day] || '';
  }

  function mapPastInstancesToTasks(
    instances: PersistedPeriodTaskInstance[],
    completedInstanceKeys: string[],
    completed: boolean
  ): Task[] {
    const completedKeySet = new Set(completedInstanceKeys);

    return instances
      .filter((instance) => completedKeySet.has(instance.instance_key) === completed)
      .map((instance) => ({
        id: instance.template_id,
        title: instance.title,
        type: instance.type,
        completed,
        notes: instance.notes,
        created_at: instance.created_at
      }));
  }

  function getPastCompletedTasks(): Task[] {
    if (
      weeklyInstancesQuery.isSuccess &&
      monthlyInstancesQuery.isSuccess &&
      weeklyInstanceStatusQuery.isSuccess &&
      monthlyInstanceStatusQuery.isSuccess
    ) {
      return [
        ...mapPastInstancesToTasks(
          (weeklyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
          weeklyInstanceStatusQuery.data ?? [],
          true
        ),
        ...mapPastInstancesToTasks(
          (monthlyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
          monthlyInstanceStatusQuery.data ?? [],
          true
        )
      ];
    }

    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    if (
      weeklyInstancesQuery.isSuccess &&
      monthlyInstancesQuery.isSuccess &&
      weeklyInstanceStatusQuery.isSuccess &&
      monthlyInstanceStatusQuery.isSuccess
    ) {
      return [
        ...mapPastInstancesToTasks(
          (weeklyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
          weeklyInstanceStatusQuery.data ?? [],
          false
        ),
        ...mapPastInstancesToTasks(
          (monthlyInstancesQuery.data ?? []) as PersistedPeriodTaskInstance[],
          monthlyInstanceStatusQuery.data ?? [],
          false
        )
      ];
    }

    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  function getPastTasks(): Task[] {
    return [...getPastCompletedTasks(), ...getPastMissedTasks()];
  }

  function getPastCompletedScheduleBlocks(): ScheduleBlock[] {
    if (scheduleQuery.isSuccess) {
      return (scheduleQuery.data ?? []).filter((block) => parseScheduleBlockDetails(block.notes).completed);
    }

    return (snapshotQuery.data?.completed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  function getPastMissedScheduleBlocks(): ScheduleBlock[] {
    if (scheduleQuery.isSuccess) {
      return (scheduleQuery.data ?? []).filter(
        (block) => !parseScheduleBlockDetails(block.notes).completed
      );
    }

    return (snapshotQuery.data?.missed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  function hasPastArchiveContent(): boolean {
    return Boolean(
      DAY_NAMES.some((day) => getPastPlannerNote(day).trim().length > 0) ||
        getPastCompletedTasks().length > 0 ||
        getPastMissedTasks().length > 0 ||
        getPastCompletedScheduleBlocks().length > 0 ||
        getPastMissedScheduleBlocks().length > 0 ||
        snapshotQuery.data
    );
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
          Gecmis haftanin review gorunumu — salt okunur
        </span>
        <a
          href={currentWeekHref}
          class="ml-auto text-xs text-zinc-400 underline underline-offset-2 transition-colors duration-150 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400"
        >
          Bu haftaya dön
        </a>
      </div>
    {/if}
    <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-1">
      <a
        href={previousWeekHref}
        class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft size={16} />
      </a>
      <span class="whitespace-nowrap px-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {weekLabel(currentWeekKey)}
      </span>
      <a
        href={nextWeekHref}
        class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronRight size={16} />
      </a>
      {#if !isCurrentWeek}
        <a
          href={currentWeekHref}
          class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1"
        >
          This week
        </a>
      {/if}
    </div>
    {#if isPastWeek}
      <span class="text-xs text-zinc-400 italic">Archived — Read Only</span>
    {:else}
      <a
        href="/thismonth"
        class="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Plan in This Month
      </a>
    {/if}
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-1 overflow-auto">
    {#if isPastWeek}
      <!-- Past week: read from snapshot -->
      {#if snapshotQuery.isLoading || planQuery.isLoading || weeklyInstancesQuery.isLoading || monthlyInstancesQuery.isLoading || weeklyInstanceStatusQuery.isLoading || monthlyInstanceStatusQuery.isLoading || scheduleQuery.isLoading}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400">Loading…</div>
      {:else if !hasPastArchiveContent()}
        <EmptyState message="No archived data found for this week." />
      {:else}
        <div class="grid grid-cols-1 gap-[var(--space-lg)] p-[var(--space-xl)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <!-- Left: Planner notes -->
          <Card class="bg-zinc-900/80">
            <div class="flex flex-col gap-[var(--space-md)]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <SectionHeader>Past Week Review</SectionHeader>
                  <PageTitle class="mt-2 text-lg">Weekly review</PageTitle>
                </div>
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
            <SectionHeader>Haftalik Sonuc</SectionHeader>
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
      <div class="flex flex-col gap-[var(--space-lg)] p-[var(--space-xl)]">
        <Card class="border-zinc-800 bg-zinc-950 text-zinc-50">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-2xl">
              <SectionHeader class="text-zinc-500">Operating Console</SectionHeader>
              <PageTitle class="mt-2 text-2xl text-zinc-50">
                {isCurrentWeek ? 'This week in motion' : 'Prepare this week'}
              </PageTitle>
              <p class="mt-3 text-sm leading-6 text-zinc-400">
                {isCurrentWeek
                  ? 'Plan bugunu, kapa donguleri ve haftanin geri kalanini tek yerde yurur hale getir.'
                  : 'Yaklasan haftayi netlestir, gunlere not dus ve execution queue’yu hazirla.'}
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-[18px] border border-white/8 bg-white/4 px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  {isCurrentWeek ? 'Today open' : 'Week open'}
                </div>
                <div class="mt-2 text-2xl font-semibold text-zinc-50">
                  {isCurrentWeek ? getTodayOpenInstances().length : getCurrentWeekOpenCount()}
                </div>
              </div>
              <div class="rounded-[18px] border border-white/8 bg-white/4 px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Week done</div>
                <div class="mt-2 text-2xl font-semibold text-zinc-50">
                  {getCurrentWeekCompletedCount()}
                </div>
              </div>
              <div class="rounded-[18px] border border-white/8 bg-white/4 px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Source</div>
                <div class="mt-2 text-sm font-medium text-zinc-200">This Month plan</div>
              </div>
            </div>
          </div>
        </Card>

        {#if isCurrentWeek}
          <div class="grid grid-cols-1 gap-[var(--space-lg)] xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div class="flex flex-col gap-[var(--space-lg)]">
            <Card class="bg-zinc-900/85">
              <div class="flex flex-col gap-[var(--space-md)]">
                <div>
                  <SectionHeader>Today Planner</SectionHeader>
                  <PageTitle class="mt-2 text-lg">
                    {todaySection?.day ?? getTodayDayName()}
                  </PageTitle>
                  {#if todaySection}
                    <p class="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Bugunun notlarini ve hazirliklarini burada tut.
                    </p>
                  {/if}
                </div>
                {#if getTodayDayName()}
                  <DayCard
                    weekKey={currentWeekKey}
                    day={getTodayDayName() ?? DAY_NAMES[0]}
                    dateLabel={getDayDateLabel(getTodayDayName() ?? DAY_NAMES[0])}
                    initialContent={getPlanContent(getTodayDayName() ?? DAY_NAMES[0])}
                    isToday={true}
                    readonly={false}
                  />
                {/if}
              </div>
            </Card>

            <Card class="bg-zinc-900/45">
              <div class="flex flex-col gap-[var(--space-md)]">
                <div>
                  <SectionHeader>Execution Companion</SectionHeader>
                  <PageTitle class="mt-2 text-lg">Keep momentum</PageTitle>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <a
                    href="/pomodoro"
                    class="rounded-[18px] border border-zinc-800 bg-zinc-900/70 px-4 py-4 transition-colors duration-150 hover:border-zinc-700"
                  >
                    <div class="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Focus</div>
                    <div class="mt-2 text-sm font-medium text-zinc-100">Open Pomodoro</div>
                    <div class="mt-2 text-sm text-zinc-400">
                      Secili gorevle sprint baslat.
                    </div>
                  </a>
                  <a
                    href="/thismonth"
                    class="rounded-[18px] border border-zinc-800 bg-zinc-900/70 px-4 py-4 transition-colors duration-150 hover:border-zinc-700"
                  >
                    <div class="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Planning</div>
                    <div class="mt-2 text-sm font-medium text-zinc-100">Open This Month</div>
                    <div class="mt-2 text-sm text-zinc-400">
                      Hafta bos kaldiginda ayi yeniden duzenle.
                    </div>
                  </a>
                </div>
              </div>
            </Card>
            </div>

            <Card class="bg-zinc-900/35">
              <div class="flex flex-col gap-[var(--space-md)]">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <SectionHeader>Today Queue</SectionHeader>
                    <PageTitle class="mt-2 text-lg">Execute now</PageTitle>
                  </div>
                  <span class="text-xs text-zinc-500 dark:text-zinc-400">From This Month</span>
                </div>

                {#if !todaySection}
                  <EmptyState
                    class="py-10"
                    message="Bugun icin planlanmis gorev yok. This Month tarafindan bir gun atamasi yapabilir veya planner notu ile bugunu sekillendirebilirsin."
                    actionLabel="This Month'a git"
                    onAction={() => {
                      window.location.href = '/thismonth';
                    }}
                  />
                {:else}
                  <ThisWeekDayStack
                    day={todaySection.day}
                    dateLabel={todaySection.dateLabel}
                    isToday={true}
                    activeInstances={todaySection.activeInstances}
                    completedInstances={todaySection.completedInstances}
                    sourceLabelFor={getInstanceSourceLabel}
                    attachmentsFor={getCurrentAttachmentsForInstance}
                    transitionFor={isCompletionTransitioning}
                    onToggle={toggleCurrentInstance}
                  />
                {/if}
              </div>
            </Card>
          </div>
        {/if}

        <div class="grid grid-cols-1 gap-[var(--space-lg)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card class="bg-zinc-900/80">
            <div class="flex flex-col gap-[var(--space-md)]">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <SectionHeader>Week Planner</SectionHeader>
                  <PageTitle class="mt-2 text-lg">
                    {isCurrentWeek ? 'Rest of the week' : 'Weekly planner'}
                  </PageTitle>
                </div>
                <SectionHeader>Gunluk Notlar</SectionHeader>
              </div>
              {#if planQuery.isLoading}
                <EmptyState message="Planner notes are loading." />
              {:else}
                {#each (isCurrentWeek ? getPlannerDays() : DAY_NAMES) as day, i}
                  <DayCard
                    weekKey={currentWeekKey}
                    {day}
                    dateLabel={getDayDateLabel(day)}
                    initialContent={getPlanContent(day)}
                    isToday={isCurrentWeek ? day === getTodayDayName() : isToday(i)}
                    readonly={false}
                  />
                {/each}
              {/if}
            </div>
          </Card>

          <div class="xl:border-l xl:border-zinc-800 xl:pl-[var(--space-lg)]">
            <Card class="bg-zinc-900/35">
              <div class="flex flex-col gap-[var(--space-md)]">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <SectionHeader>Week Queue</SectionHeader>
                    <PageTitle class="mt-2 text-lg">
                      {isCurrentWeek ? 'Later this week' : 'Execution queue'}
                    </PageTitle>
                  </div>
                  <span class="text-xs text-zinc-500 dark:text-zinc-400">Execution from This Month</span>
                </div>
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
                    {#each (isCurrentWeek ? remainingWeekSections : currentWeekSections) as section (section.day)}
                      <ThisWeekDayStack
                        day={section.day}
                        dateLabel={section.dateLabel}
                        isToday={section.isToday}
                        activeInstances={section.activeInstances}
                        completedInstances={section.completedInstances}
                        sourceLabelFor={getInstanceSourceLabel}
                        attachmentsFor={getCurrentAttachmentsForInstance}
                        transitionFor={isCompletionTransitioning}
                        onToggle={toggleCurrentInstance}
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            </Card>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
