<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { format } from 'date-fns';
  import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiJson, apiSendJson, canUseClientApi } from '$lib/client/api';
  import {
    MONTHLY_PLAN_DAYS,
    MONTHLY_PLAN_WEEKS,
    buildMonthlyPlanBoardFromInstances
  } from '$lib/monthlyPlan';
  import {
    createMonthlyPeriodInstances,
    getMonthlyInstanceStatusStorageKey,
    getMonthlyInstancesStorageKey,
    getWeeklyInstanceStatusStorageKey,
    getWeeklyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    toggleCompletedInstanceKey,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { summarizeInstances, summarizeSnapshot } from '$lib/periodSummary';
  import {
    generateMonthlySpread
  } from '$lib/monthlySpreadGenerate';
  import {
    buildWeeklyCellMap,
    moveMonthlyInstance,
    moveWeeklyInstance
  } from '$lib/monthlySpreadBoard';
  import {
    parseScheduleBlockDetails,
    serializeScheduleBlockDetails
  } from '$lib/scheduleBlockDetails';
  import { authPassword } from '$lib/stores';
  import {
    addMonths,
    getMonthKey,
    getMonthWeekKey,
    getWeekDays,
    monthLabel
  } from '$lib/weekUtils';
  import TaskList from '$lib/components/TaskList.svelte';
  import {
    materializeMonthlyTaskInstances,
    materializeWeeklyTaskInstances
  } from '$lib/recurringTasks';
  import type { HistorySnapshot, ScheduleBlock, Task } from '$lib/types';

  const queryClient = useQueryClient();
  const today = new Date();
  let monthOffset = $state(0);
  const canAccessApi = $derived(canUseClientApi($authPassword));

  const currentMonthKey = $derived(getMonthKey(addMonths(today, monthOffset)));
  const isPastMonth = $derived(monthOffset < 0);
  const monthlyInstancesStorageKey = $derived(getMonthlyInstancesStorageKey(currentMonthKey));
  const monthlyInstanceStatusStorageKey = $derived(
    getMonthlyInstanceStatusStorageKey(currentMonthKey)
  );

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks', 'monthly'] as const,
    queryFn: async () => apiJson<Task[]>('/api/tasks?type=monthly'),
    enabled: browser && canAccessApi && !isPastMonth
  }));

  const weeklyTasksQuery = createQuery(() => ({
    queryKey: ['tasks', 'weekly'] as const,
    queryFn: async () => apiJson<Task[]>('/api/tasks?type=weekly'),
    enabled: browser && canAccessApi && !isPastMonth
  }));

  const snapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', 'monthly', currentMonthKey] as const,
    queryFn: async () =>
      apiJson<HistorySnapshot | null>(
        `/api/snapshots?periodType=monthly&periodKey=${encodeURIComponent(currentMonthKey)}`
      ),
    enabled: browser && canAccessApi && isPastMonth
  }));

  const monthlyInstancesQuery = createQuery(() => ({
    queryKey: ['thismonth_page', 'period_instances', currentMonthKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(monthlyInstancesStorageKey)}`
      );
      return response.entries[0]?.value ?? null;
    },
    enabled: browser && canAccessApi && !isPastMonth
  }));

  const monthlyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', 'monthly', monthlyInstanceStatusStorageKey] as const,
    queryFn: async () => {
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?key=${encodeURIComponent(monthlyInstanceStatusStorageKey)}`
      );
      return response.entries[0]?.value ?? null;
    },
    enabled: browser && canAccessApi && !isPastMonth
  }));

  const weeklyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', 'weekly', currentMonthKey] as const,
    queryFn: async () => {
      const keys = MONTHLY_PLAN_WEEKS.map((w) =>
        getWeeklyInstanceStatusStorageKey(getMonthWeekKey(currentMonthKey, w))
      );
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?keys=${encodeURIComponent(keys.join(','))}`
      );
      const map: Record<string, string[]> = {};
      for (const row of response.entries) {
        const parsed = parsePersistedPeriodInstanceStatus(row.value);
        if (parsed) map[row.key] = parsed.completedInstanceKeys;
      }
      return map;
    },
    enabled: browser && canAccessApi && !isPastMonth
  }));

  const weeklyInstancesQuery = createQuery(() => ({
    queryKey: ['thismonth_page', 'weekly_period_instances', currentMonthKey] as const,
    queryFn: async () => {
      const keys = MONTHLY_PLAN_WEEKS.map((week) =>
        getWeeklyInstancesStorageKey(getMonthWeekKey(currentMonthKey, week))
      );
      const response = await apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
        `/api/preferences?keys=${encodeURIComponent(keys.join(','))}`
      );

      const map: Record<string, PersistedPeriodTaskInstance[]> = {};
      for (const row of response.entries) {
        const parsed = parsePersistedPeriodInstances(row.value);
        const periodKey = row.key.replace('period_instances:weekly:', '');
        if (parsed) map[periodKey] = parsed.instances;
      }

      return map;
    },
    enabled: browser && canAccessApi && !isPastMonth
  }));

  let monthlyPeriodInstances = $state<PersistedPeriodTaskInstance[]>([]);
  let weeklyPeriodInstancesByWeek = $state<Record<string, PersistedPeriodTaskInstance[]>>({});
  let monthlyCompletedInstanceKeys = $state<string[]>([]);
  let weeklyCompletedByStatusKey = $state<Record<string, string[]>>({});
  let activeDropZone = $state<string | null>(null);
  let activeDragPayload = $state<BoardDragPayload | null>(null);
  let isAutoDistributing = $state(false);

  const monthlyTemplateInstances = $derived(
    materializeMonthlyTaskInstances(tasksQuery.data ?? [], currentMonthKey).map((instance) => ({
      ...instance,
      id: `monthly-source:${currentMonthKey}:${instance.template_id}`,
      instance_key: `monthly-source:${currentMonthKey}:${instance.template_id}`,
      carryover: false,
      carryover_source_period_key: null
    }))
  );

  const generatedMonthlyInstances = $derived(
    createMonthlyPeriodInstances({
      monthKey: currentMonthKey,
      monthlyTasks: tasksQuery.data ?? []
    })
  );

  const weeklyTemplateInstancesByWeek = $derived.by(() => {
    const byWeek: Record<number, PersistedPeriodTaskInstance[]> = {};

    for (const weekNum of MONTHLY_PLAN_WEEKS) {
      const weekKey = getMonthWeekKey(currentMonthKey, weekNum);
      byWeek[weekNum] = materializeWeeklyTaskInstances(weeklyTasksQuery.data ?? [], weekKey).map(
        (instance) => ({
          ...instance,
          id: `weekly-source:${weekKey}:${instance.template_id}`,
          instance_key: `weekly-source:${weekKey}:${instance.template_id}`,
          carryover: false,
          carryover_source_period_key: null
        })
      );
    }

    return byWeek;
  });

  const monthlyPlanBoard = $derived(buildMonthlyPlanBoardFromInstances(monthlyPeriodInstances));
  const monthlyCellMap = $derived.by(() => {
    const nextCells: Record<string, PersistedPeriodTaskInstance[]> = {};

    for (const cell of monthlyPlanBoard.cells) {
      nextCells[getCellKey(cell.week, cell.day)] =
        cell.tasks as PersistedPeriodTaskInstance[];
    }

    return nextCells;
  });
  const monthlyFlexibleInstances = $derived(
    monthlyPlanBoard.flexibleTasks as PersistedPeriodTaskInstance[]
  );
  const weeklyCellMap = $derived(buildWeeklyCellMap(currentMonthKey, weeklyPeriodInstancesByWeek));
  const monthlyInstanceSummary = $derived(
    summarizeInstances(monthlyPeriodInstances, monthlyCompletedInstanceKeys)
  );

  type MonthlyBoardDragPayload =
    | { kind: 'monthly-template'; templateId: string }
    | { kind: 'monthly-instance'; instanceKey: string };
  type WeeklyBoardDragPayload =
    | { kind: 'weekly-template'; templateId: string; week: number }
    | { kind: 'weekly-instance'; instanceKey: string; week: number };
  type BoardDragPayload = MonthlyBoardDragPayload | WeeklyBoardDragPayload;

  const BOARD_DRAG_MIME = 'application/x-taskpad-monthly-board';

  function getMonthlyTemplateHourLimit(templateId: string): number {
    return monthlyTemplateInstances.find((instance) => instance.template_id === templateId)
      ?.estimated_hours ?? 1;
  }

  function getWeeklyTemplateHourLimit(week: number, templateId: string): number {
    return weeklyTemplateInstancesByWeek[week]?.find(
      (instance) => instance.template_id === templateId
    )?.estimated_hours ?? 1;
  }

  function getMonthlyAllocatedHours(templateId: string): number {
    return monthlyPeriodInstances
      .filter((instance) => instance.template_id === templateId)
      .reduce((sum, instance) => sum + (instance.estimated_hours ?? 1), 0);
  }

  function getWeeklyAllocatedHours(week: number, templateId: string): number {
    const weekKey = getMonthWeekKey(currentMonthKey, week);
    return (weeklyPeriodInstancesByWeek[weekKey] ?? [])
      .filter((instance) => instance.template_id === templateId)
      .reduce((sum, instance) => sum + (instance.estimated_hours ?? 1), 0);
  }

  function createInstanceCopyId(
    kind: 'weekly' | 'monthly',
    templateId: string,
    periodKey: string
  ): string {
    return `${kind}:${templateId}:${periodKey}:${crypto.randomUUID()}`;
  }

  function createMonthlyInstanceCopy(
    source: PersistedPeriodTaskInstance,
    week: number | null,
    day: PersistedPeriodTaskInstance['preferred_day']
  ): PersistedPeriodTaskInstance | null {
    const unitHours = Math.min(1, source.estimated_hours ?? 1);
    if (
      getMonthlyAllocatedHours(source.template_id) + unitHours >
      getMonthlyTemplateHourLimit(source.template_id)
    ) {
      toast.error(`"${source.title}" monthly hour limit reached`);
      return null;
    }

    const instanceKey = createInstanceCopyId('monthly', source.template_id, currentMonthKey);
    return {
      ...source,
      id: instanceKey,
      instance_key: instanceKey,
      period_key: currentMonthKey,
      period_type: 'monthly',
      estimated_hours: unitHours,
      preferred_week_of_month: week,
      preferred_day: day,
      completed: false,
      carryover: false,
      carryover_source_period_key: null
    };
  }

  function createWeeklyInstanceCopy(
    source: PersistedPeriodTaskInstance,
    week: number,
    day: string
  ): PersistedPeriodTaskInstance | null {
    const weekKey = getMonthWeekKey(currentMonthKey, week);
    const unitHours = Math.min(1, source.estimated_hours ?? 1);
    if (
      getWeeklyAllocatedHours(week, source.template_id) + unitHours >
      getWeeklyTemplateHourLimit(week, source.template_id)
    ) {
      toast.error(`"${source.title}" weekly hour limit reached`);
      return null;
    }

    const instanceKey = createInstanceCopyId('weekly', source.template_id, weekKey);
    return {
      ...source,
      id: instanceKey,
      instance_key: instanceKey,
      period_key: weekKey,
      period_type: 'weekly',
      estimated_hours: unitHours,
      preferred_week_of_month: week,
      preferred_day: day as PersistedPeriodTaskInstance['preferred_day'],
      completed: false,
      carryover: false,
      carryover_source_period_key: null
    };
  }

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  function isInstanceCompleted(instanceKey: string): boolean {
    return monthlyCompletedInstanceKeys.includes(instanceKey);
  }

  function isWeeklyInstanceCompleted(instanceKey: string): boolean {
    const weekKey = instanceKey.split(':')[2];
    const statusKey = getWeeklyInstanceStatusStorageKey(weekKey);
    return (weeklyCompletedByStatusKey[statusKey] ?? []).includes(instanceKey);
  }

  async function toggleWeeklyInstance(instanceKey: string) {
    if (isPastMonth) return;
    const weekKey = instanceKey.split(':')[2];
    const statusKey = getWeeklyInstanceStatusStorageKey(weekKey);
    const currentCompleted = weeklyCompletedByStatusKey[statusKey] ?? [];
    const {
      completed: nowCompleted,
      completedInstanceKeys: nextCompleted
    } = toggleCompletedInstanceKey(currentCompleted, instanceKey);
    const updatedAt = new Date().toISOString();

    try {
      await apiSendJson('/api/preferences', 'POST', {
        key: statusKey,
        value: { completedInstanceKeys: nextCompleted, updatedAt },
        updatedAt
      });
    } catch {
      toast.error('Failed to update weekly status');
      return;
    }

    weeklyCompletedByStatusKey = { ...weeklyCompletedByStatusKey, [statusKey]: nextCompleted };
    await syncScheduleBlocksForInstance(instanceKey, nowCompleted);
    queryClient.setQueryData(
      ['period_instance_status', 'weekly', currentMonthKey],
      { ...weeklyCompletedByStatusKey, [statusKey]: nextCompleted }
    );
  }

  function getCellKey(week: number, day: string): string {
    return `${week}:${day}`;
  }

  function getMonthCellDateLabel(week: number, day: string): string {
    const weekDays = getWeekDays(getMonthWeekKey(currentMonthKey, week));
    const dayIndex = MONTHLY_PLAN_DAYS.indexOf(day as (typeof MONTHLY_PLAN_DAYS)[number]);
    const date = weekDays[dayIndex];
    return date ? format(date, 'd MMM') : '';
  }

  function getMonthlyDropZoneKey(week: number, day: string): string {
    return `monthly:${week}:${day}`;
  }

  function getWeeklyDropZoneKey(week: number, day: string): string {
    return `weekly:${week}:${day}`;
  }

  function handleBoardDragStart(event: DragEvent, payload: BoardDragPayload) {
    activeDragPayload = payload;
    if (!event.dataTransfer) return;

    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(BOARD_DRAG_MIME, serialized);
    event.dataTransfer.setData('text/plain', serialized);
  }

  function handleBoardDragEnd() {
    activeDropZone = null;
    activeDragPayload = null;
  }

  function readBoardDragPayload(event: DragEvent): BoardDragPayload | null {
    if (activeDragPayload) {
      return activeDragPayload;
    }

    const raw =
      event.dataTransfer?.getData(BOARD_DRAG_MIME) ?? event.dataTransfer?.getData('text/plain');
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as BoardDragPayload;
      if (
        parsed.kind === 'monthly-template' ||
        parsed.kind === 'monthly-instance' ||
        parsed.kind === 'weekly-template' ||
        parsed.kind === 'weekly-instance'
      ) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }

  function allowBoardDrop(
    event: DragEvent,
    zoneKey: string,
    canDrop: (payload: BoardDragPayload) => boolean
  ) {
    const payload = readBoardDragPayload(event);
    if (!payload || !canDrop(payload)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    activeDropZone = zoneKey;
  }

  function clearDropZone(zoneKey: string) {
    if (activeDropZone === zoneKey) {
      activeDropZone = null;
    }
  }

  function canDropMonthlyPayload(payload: BoardDragPayload): payload is MonthlyBoardDragPayload {
    return payload.kind === 'monthly-template' || payload.kind === 'monthly-instance';
  }

  function canDropWeeklyPayload(
    week: number,
    payload: BoardDragPayload
  ): payload is WeeklyBoardDragPayload {
    if (payload.kind === 'weekly-template' || payload.kind === 'weekly-instance') {
      return payload.week === week;
    }

    return false;
  }

  function canDropIntoCell(week: number, payload: BoardDragPayload): boolean {
    return canDropMonthlyPayload(payload) || canDropWeeklyPayload(week, payload);
  }

  function findMonthlyTemplateInstance(templateId: string): PersistedPeriodTaskInstance | undefined {
    return monthlyTemplateInstances.find((instance) => instance.template_id === templateId);
  }

  function findWeeklyTemplateInstance(
    week: number,
    templateId: string
  ): PersistedPeriodTaskInstance | undefined {
    return weeklyTemplateInstancesByWeek[week]?.find((instance) => instance.template_id === templateId);
  }

  function mergeMonthlyInstances(
    persistedInstances: PersistedPeriodTaskInstance[],
    templateInstances: PersistedPeriodTaskInstance[]
  ): PersistedPeriodTaskInstance[] {
    const templateById = new Map(
      templateInstances.map((instance) => [instance.template_id, instance])
    );

    return persistedInstances
      .filter((instance) => templateById.has(instance.template_id))
      .map((instance) => {
        const templateInstance = templateById.get(instance.template_id);
        if (!templateInstance) return instance;

        return {
          ...templateInstance,
          ...instance,
          title: templateInstance.title,
          notes: templateInstance.notes,
          estimated_hours: instance.estimated_hours ?? Math.min(1, templateInstance.estimated_hours ?? 1),
          preferred_week_of_month:
            instance.preferred_week_of_month != null
              ? instance.preferred_week_of_month
              : templateInstance.preferred_week_of_month,
          preferred_day:
            instance.preferred_day != null
              ? instance.preferred_day
              : templateInstance.preferred_day,
          carryover: templateInstance.carryover,
          carryover_source_period_key: templateInstance.carryover_source_period_key
        };
      });
  }

  function mergeWeeklyInstances(
    persistedInstances: PersistedPeriodTaskInstance[],
    templateInstances: PersistedPeriodTaskInstance[]
  ): PersistedPeriodTaskInstance[] {
    const templateById = new Map(
      templateInstances.map((instance) => [instance.template_id, instance])
    );

    return persistedInstances
      .filter((instance) => templateById.has(instance.template_id))
      .map((instance) => {
        const templateInstance = templateById.get(instance.template_id);
        if (!templateInstance) return instance;

        return {
          ...templateInstance,
          ...instance,
          title: templateInstance.title,
          notes: templateInstance.notes,
          estimated_hours: instance.estimated_hours ?? Math.min(1, templateInstance.estimated_hours ?? 1),
          preferred_day:
            instance.preferred_day != null ? instance.preferred_day : templateInstance.preferred_day
        };
      });
  }

  $effect(() => {
    if (isPastMonth) {
      monthlyPeriodInstances = [];
      return;
    }

    const persisted = parsePersistedPeriodInstances(monthlyInstancesQuery.data);
    monthlyPeriodInstances = persisted?.instances.length
      ? mergeMonthlyInstances(persisted.instances, generatedMonthlyInstances)
      : [];
  });

  $effect(() => {
    if (isPastMonth) {
      weeklyPeriodInstancesByWeek = {};
      return;
    }

    const persistedByWeek = weeklyInstancesQuery.data ?? {};
    const nextByWeek: Record<string, PersistedPeriodTaskInstance[]> = {};

    for (const week of MONTHLY_PLAN_WEEKS) {
      const weekKey = getMonthWeekKey(currentMonthKey, week);
      const persistedInstances = persistedByWeek[weekKey] ?? [];
      nextByWeek[weekKey] = persistedInstances.length
        ? mergeWeeklyInstances(persistedInstances, weeklyTemplateInstancesByWeek[week] ?? [])
        : [];
    }

    weeklyPeriodInstancesByWeek = nextByWeek;
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
    if (isPastMonth) {
      weeklyCompletedByStatusKey = {};
      return;
    }
    weeklyCompletedByStatusKey = weeklyInstanceStatusQuery.data ?? {};
  });

  async function toggleInstance(instanceKey: string) {
    if (isPastMonth) return;

    const {
      completed: nextCompleted,
      completedInstanceKeys: nextCompletedInstanceKeys
    } = toggleCompletedInstanceKey(
      monthlyCompletedInstanceKeys,
      instanceKey
    );
    const updatedAt = new Date().toISOString();

    try {
      await apiSendJson('/api/preferences', 'POST', {
        key: monthlyInstanceStatusStorageKey,
        value: {
          completedInstanceKeys: nextCompletedInstanceKeys,
          updatedAt
        },
        updatedAt
      });
    } catch {
      toast.error('Failed to update this month status');
      return;
    }

    monthlyCompletedInstanceKeys = nextCompletedInstanceKeys;

    await syncScheduleBlocksForInstance(instanceKey, nextCompleted);

    queryClient.setQueryData(
      ['period_instance_status', 'monthly', monthlyInstanceStatusStorageKey],
      {
        completedInstanceKeys: nextCompletedInstanceKeys,
        updatedAt
      }
    );
  }

  async function syncScheduleBlocksForInstance(instanceKey: string, completed: boolean) {
    const monthWeekKeys = MONTHLY_PLAN_WEEKS.map((week) => getMonthWeekKey(currentMonthKey, week));
    const data = await apiJson<ScheduleBlock[]>(
      `/api/weekly-schedule?weekKeys=${encodeURIComponent(monthWeekKeys.join(','))}`
    ).catch(() => {
      toast.error('This Month updated, but This Week sync failed');
      return null;
    });

    if (!data) return;

    const matchingBlocks = data.filter(
      (block) => parseScheduleBlockDetails(block.notes).linkedInstanceKey === instanceKey
    );

    if (matchingBlocks.length === 0) return;

    await Promise.all(
      matchingBlocks.map((block) => {
        const details = parseScheduleBlockDetails(block.notes);
        return apiSendJson(`/api/weekly-schedule/${block.id}`, 'PATCH', {
          notes: serializeScheduleBlockDetails(
            details.notes,
            completed,
            details.linkedTaskId,
            details.linkedTaskType,
            details.linkedInstanceKey
          )
        });
      })
    );

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule'] });
  }

  async function persistMonthlyInstances(nextInstances: PersistedPeriodTaskInstance[]) {
    const updatedAt = new Date().toISOString();
    monthlyPeriodInstances = nextInstances;

    try {
      await apiSendJson('/api/preferences', 'POST', {
        key: monthlyInstancesStorageKey,
        value: {
          instances: nextInstances,
          updatedAt
        },
        updatedAt
      });
    } catch {
      toast.error('Failed to save month board order');
      return;
    }

    queryClient.setQueryData(['thismonth_page', 'period_instances', currentMonthKey], {
      instances: nextInstances,
      updatedAt
    });
  }

  async function persistWeeklyInstances(
    week: number,
    nextWeekInstances: PersistedPeriodTaskInstance[]
  ) {
    const weekKey = getMonthWeekKey(currentMonthKey, week);
    const updatedAt = new Date().toISOString();
    const normalizedInstances = nextWeekInstances.map((instance) => ({
      ...instance,
      id: instance.instance_key,
      period_key: weekKey
    }));
    weeklyPeriodInstancesByWeek = {
      ...weeklyPeriodInstancesByWeek,
      [weekKey]: normalizedInstances
    };

    try {
      await apiSendJson('/api/preferences', 'POST', {
        key: getWeeklyInstancesStorageKey(weekKey),
        value: {
          instances: normalizedInstances,
          updatedAt
        },
        updatedAt
      });
    } catch {
      toast.error('Failed to save weekly board order');
      return;
    }

    queryClient.setQueryData(['thismonth_page', 'weekly_period_instances', currentMonthKey], {
      ...(weeklyInstancesQuery.data ?? {}),
      [weekKey]: normalizedInstances
    });
  }

  async function handleMonthlyCellDrop(week: number, day: string, event: DragEvent) {
    const payload = readBoardDragPayload(event);
    if (!payload || !canDropMonthlyPayload(payload)) return;

    event.preventDefault();
    activeDropZone = null;

    if (payload.kind === 'monthly-template') {
      const templateInstance = findMonthlyTemplateInstance(payload.templateId);
      if (!templateInstance) return;

      const copy = createMonthlyInstanceCopy(
        templateInstance,
        week,
        day as PersistedPeriodTaskInstance['preferred_day']
      );
      if (!copy) return;

      await persistMonthlyInstances([...monthlyPeriodInstances, copy]);
      activeDragPayload = null;
      return;
    }

    await persistMonthlyInstances(
      moveMonthlyInstance(monthlyPeriodInstances, payload.instanceKey, {
        preferred_week_of_month: week,
        preferred_day: day as PersistedPeriodTaskInstance['preferred_day']
      })
    );
    activeDragPayload = null;
  }

  async function handleFlexibleDrop(event: DragEvent) {
    const payload = readBoardDragPayload(event);
    if (!payload || !canDropMonthlyPayload(payload)) return;

    event.preventDefault();
    activeDropZone = null;

    if (payload.kind === 'monthly-template') {
      const templateInstance = findMonthlyTemplateInstance(payload.templateId);
      if (!templateInstance) return;

      const copy = createMonthlyInstanceCopy(templateInstance, null, null);
      if (!copy) return;

      await persistMonthlyInstances([...monthlyPeriodInstances, copy]);
      activeDragPayload = null;
      return;
    }

    await persistMonthlyInstances(
      moveMonthlyInstance(monthlyPeriodInstances, payload.instanceKey, {
        preferred_week_of_month: null,
        preferred_day: null
      })
    );
    activeDragPayload = null;
  }

  async function handleWeeklyCellDrop(week: number, day: string, event: DragEvent) {
    const payload = readBoardDragPayload(event);
    if (!payload || !canDropWeeklyPayload(week, payload)) return;

    event.preventDefault();
    activeDropZone = null;

    const weekKey = getMonthWeekKey(currentMonthKey, week);
    const currentWeekInstances = weeklyPeriodInstancesByWeek[weekKey] ?? [];

    if (payload.kind === 'weekly-template') {
      const templateInstance = findWeeklyTemplateInstance(week, payload.templateId);
      if (!templateInstance) return;

      const copy = createWeeklyInstanceCopy(templateInstance, week, day);
      if (!copy) return;

      await persistWeeklyInstances(week, [...currentWeekInstances, copy]);
      activeDragPayload = null;
      return;
    }

    await persistWeeklyInstances(
      week,
      moveWeeklyInstance(
        currentWeekInstances,
        payload.instanceKey,
        weekKey,
        day as PersistedPeriodTaskInstance['preferred_day']
      )
    );
    activeDragPayload = null;
  }

  async function handleBoardCellDrop(week: number, day: string, event: DragEvent) {
    const payload = readBoardDragPayload(event);
    if (!payload || !canDropIntoCell(week, payload)) return;

    if (canDropMonthlyPayload(payload)) {
      await handleMonthlyCellDrop(week, day, event);
      return;
    }

    await handleWeeklyCellDrop(week, day, event);
  }

  async function handleAutoDistribute() {
    if (isPastMonth || isAutoDistributing) return;

    const hasExistingLayout =
      monthlyPeriodInstances.length > 0 ||
      Object.values(weeklyPeriodInstancesByWeek).some((instances) => instances.length > 0);

    if (
      hasExistingLayout &&
      browser &&
      !window.confirm('Auto Distribute mevcut monthly spread yerleşimini sıfırlayıp yeniden oluşturacak. Devam edilsin mi?')
    ) {
      return;
    }

    isAutoDistributing = true;

    try {
      const generated = generateMonthlySpread({
        monthKey: currentMonthKey,
        monthlyTemplateInstances: generatedMonthlyInstances,
        weeklyTemplateInstancesByWeek
      });
      const updatedAt = new Date().toISOString();
      const weeklyStatusMap = Object.fromEntries(
        MONTHLY_PLAN_WEEKS.map((week) => [
          getWeeklyInstanceStatusStorageKey(getMonthWeekKey(currentMonthKey, week)),
          [] as string[]
        ])
      );

      await Promise.all([
        apiSendJson('/api/preferences', 'POST', {
          key: monthlyInstancesStorageKey,
          value: {
            instances: generated.monthlyInstances,
            updatedAt
          },
          updatedAt
        }),
        apiSendJson('/api/preferences', 'POST', {
          key: monthlyInstanceStatusStorageKey,
          value: {
            completedInstanceKeys: [],
            updatedAt
          },
          updatedAt
        }),
        ...MONTHLY_PLAN_WEEKS.flatMap((week) => {
          const weekKey = getMonthWeekKey(currentMonthKey, week);
          const weeklyStatusKey = getWeeklyInstanceStatusStorageKey(weekKey);
          return [
            apiSendJson('/api/preferences', 'POST', {
              key: getWeeklyInstancesStorageKey(weekKey),
              value: {
                instances: generated.weeklyInstancesByWeek[weekKey] ?? [],
                updatedAt
              },
              updatedAt
            }),
            apiSendJson('/api/preferences', 'POST', {
              key: weeklyStatusKey,
              value: {
                completedInstanceKeys: [],
                updatedAt
              },
              updatedAt
            })
          ];
        })
      ]);

      monthlyPeriodInstances = generated.monthlyInstances;
      weeklyPeriodInstancesByWeek = generated.weeklyInstancesByWeek;
      monthlyCompletedInstanceKeys = [];
      weeklyCompletedByStatusKey = weeklyStatusMap;

      queryClient.setQueryData(['thismonth_page', 'period_instances', currentMonthKey], {
        instances: generated.monthlyInstances,
        updatedAt
      });
      queryClient.setQueryData(
        ['period_instance_status', 'monthly', monthlyInstanceStatusStorageKey],
        {
          completedInstanceKeys: [],
          updatedAt
        }
      );
      queryClient.setQueryData(
        ['thismonth_page', 'weekly_period_instances', currentMonthKey],
        generated.weeklyInstancesByWeek
      );
      queryClient.setQueryData(
        ['period_instance_status', 'weekly', currentMonthKey],
        weeklyStatusMap
      );

      toast.success('Monthly spread otomatik dagitildi');
    } catch {
      toast.error('Auto distribute basarisiz oldu');
    } finally {
      isAutoDistributing = false;
    }
  }
</script>

<svelte:head>
  <title>This Month — TaskpadSvel</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-auto p-4 sm:p-6">
    <div class="mx-auto flex max-w-5xl flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h1 class="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">This Month</h1>
          {#if isPastMonth}
            <span class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Archived</span>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1 rounded-[18px] border border-zinc-200 bg-white/80 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950/50">
            <button
              onclick={() => monthOffset -= 1}
              class="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={14} />
            </button>
            <span class="min-w-[110px] text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {monthLabel(currentMonthKey)}
            </span>
            <button
              onclick={() => monthOffset += 1}
              class="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          {#if monthOffset !== 0}
            <button
              onclick={() => monthOffset = 0}
              class="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Current month
            </button>
          {/if}

          <div class="flex items-center gap-3 rounded-[18px] border border-zinc-200 bg-white/80 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
            <span class="text-zinc-400 text-xs">Planned <span class="font-semibold text-zinc-900 dark:text-zinc-50">{isPastMonth ? summarizeSnapshot(snapshotQuery.data).plannedHours : monthlyInstanceSummary.plannedHours}h</span></span>
            <span class="text-zinc-300 dark:text-zinc-700">·</span>
            <span class="text-zinc-400 text-xs">Done <span class="font-semibold text-zinc-900 dark:text-zinc-50">{isPastMonth ? summarizeSnapshot(snapshotQuery.data).completedHours : monthlyInstanceSummary.completedHours}h</span></span>
            <span class="text-zinc-300 dark:text-zinc-700">·</span>
            <span class="text-zinc-400 text-xs">Open <span class="font-semibold text-zinc-900 dark:text-zinc-50">{isPastMonth ? summarizeSnapshot(snapshotQuery.data).openHours : monthlyInstanceSummary.openHours}h</span></span>
          </div>
        </div>
      </div>

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
        <div class="grid gap-6 xl:grid-cols-2">
          <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
            <div class="mb-5">
              <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Weekly Templates</div>
              <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                Her hafta tekrar eden işler. Kopya atmak için aşağıdaki haftalık chip'leri ilgili haftanın günlerine sürükle.
              </div>
            </div>
            <TaskList type="weekly" templateMode={true} />
          </section>

          <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
            <div class="mb-5">
              <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Monthly Templates</div>
              <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                Ay içine yayılacak recurring işler. Aşağıdaki chip'lerden calendar'a sürükleyerek manuel kopya oluştur.
              </div>
            </div>
            <TaskList type="monthly" templateMode={true} />

            <div class="mt-6 rounded-[20px] border border-sky-100 bg-sky-50/40 p-4 dark:border-sky-500/10 dark:bg-sky-950/10">
              <div class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Drag Monthly Copies
              </div>
              <div class="mt-3 flex min-h-[44px] flex-wrap gap-2">
                {#each monthlyTemplateInstances as sourceItem (sourceItem.instance_key)}
                  <div
                    draggable="true"
                    role="listitem"
                    aria-label={`Drag monthly template ${sourceItem.title}`}
                    ondragstart={(event) =>
                      handleBoardDragStart(event, {
                        kind: 'monthly-template',
                        templateId: sourceItem.template_id
                      })}
                    ondragend={handleBoardDragEnd}
                    class="inline-flex cursor-grab items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs text-sky-800 active:cursor-grabbing dark:border-sky-500/20 dark:bg-zinc-950/60 dark:text-sky-200"
                  >
                    <GripVertical size={12} />
                    {sourceItem.title}
                    <span class="text-sky-500 dark:text-sky-400">
                      max {sourceItem.estimated_hours ?? 1}h
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </section>
        </div>

        <section class="rounded-[28px] border border-zinc-200 bg-white/92 px-4 py-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.25)] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/88">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Monthly Spread</div>
              <div class="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                Bu ayın monthly instance'ları hafta/gün bazında
              </div>
            </div>
            <button
              type="button"
              onclick={handleAutoDistribute}
              disabled={isAutoDistributing}
              class="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isAutoDistributing ? 'Distributing...' : 'Auto Distribute'}
            </button>
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
                  <div class="mt-3 flex min-h-[36px] flex-col gap-1">
                    {#each weeklyTemplateInstancesByWeek[week] ?? [] as sourceItem (sourceItem.instance_key)}
                      <div
                        draggable="true"
                        role="listitem"
                        aria-label={`Drag weekly template ${sourceItem.title}`}
                        ondragstart={(event) =>
                          handleBoardDragStart(event, {
                            kind: 'weekly-template',
                            templateId: sourceItem.template_id,
                            week
                          })}
                        ondragend={handleBoardDragEnd}
                        class="inline-flex cursor-grab items-center gap-1.5 rounded-full border border-violet-200 bg-white/90 px-2 py-1 text-[10px] font-medium text-violet-800 active:cursor-grabbing dark:border-violet-500/20 dark:bg-zinc-950/60 dark:text-violet-200"
                      >
                        <GripVertical size={10} />
                        <span class="line-clamp-1">{sourceItem.title}</span>
                        <span class="text-violet-500 dark:text-violet-400">
                          {sourceItem.estimated_hours ?? 1}h
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
                {#each MONTHLY_PLAN_DAYS as day}
                  {@const cellKey = getCellKey(week, day)}
                  {@const monthlyDropZoneKey = getMonthlyDropZoneKey(week, day)}
                  {@const weeklyDropZoneKey = getWeeklyDropZoneKey(week, day)}
                  {@const cellTasks = monthlyCellMap[cellKey] ?? []}
                  {@const weeklyTasks = weeklyCellMap[cellKey] ?? []}
                  <div
                    role="group"
                    ondragover={(event) =>
                      allowBoardDrop(event, `${monthlyDropZoneKey}:cell`, (payload) =>
                        canDropIntoCell(week, payload)
                      )}
                    ondragleave={() => clearDropZone(`${monthlyDropZoneKey}:cell`)}
                    ondrop={(event) => handleBoardCellDrop(week, day, event)}
                    class={`min-h-[120px] rounded-[18px] border bg-zinc-50/60 p-3 transition-colors dark:bg-zinc-900/60 ${
                      activeDropZone === `${monthlyDropZoneKey}:cell` ||
                      activeDropZone === monthlyDropZoneKey ||
                      activeDropZone === weeklyDropZoneKey
                        ? 'border-sky-300 dark:border-sky-500/40'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div class="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      {getMonthCellDateLabel(week, day)}
                    </div>
                    <div
                      role="group"
                      ondragover={(event) =>
                        allowBoardDrop(event, monthlyDropZoneKey, canDropMonthlyPayload)}
                      ondragleave={() => clearDropZone(monthlyDropZoneKey)}
                      ondrop={(event) => {
                        event.stopPropagation();
                        handleMonthlyCellDrop(week, day, event);
                      }}
                      class={`flex min-h-[76px] flex-col gap-2 rounded-[14px] transition-colors ${
                        activeDropZone === monthlyDropZoneKey
                          ? 'bg-sky-50/70 dark:bg-sky-950/10'
                          : ''
                      }`}
                    >
                      {#each cellTasks as instance (instance.instance_key)}
                        <div class="group flex items-start gap-2">
                          <div class="mt-3 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600">
                            <GripVertical size={12} />
                          </div>
                          <button
                            draggable="true"
                            aria-label={`Move monthly task ${instance.title}`}
                            ondragstart={(event) =>
                              handleBoardDragStart(event, {
                                kind: 'monthly-instance',
                                instanceKey: instance.instance_key
                              })}
                            ondragend={handleBoardDragEnd}
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
                              {instance.estimated_hours ?? 1}h
                            </div>
                          </button>
                        </div>
                      {/each}
                    </div>
                    <div
                      role="group"
                      ondragover={(event) =>
                        allowBoardDrop(event, weeklyDropZoneKey, (payload) =>
                          canDropWeeklyPayload(week, payload)
                        )}
                      ondragleave={() => clearDropZone(weeklyDropZoneKey)}
                      ondrop={(event) => {
                        event.stopPropagation();
                        handleWeeklyCellDrop(week, day, event);
                      }}
                      class={`mt-1 flex min-h-[8px] flex-col gap-1 rounded-[12px] transition-colors ${
                        activeDropZone === weeklyDropZoneKey
                          ? 'bg-violet-50/70 dark:bg-violet-950/10'
                          : ''
                      }`}
                    >
                      {#each weeklyTasks as wInstance (wInstance.instance_key)}
                        <div class="group flex items-start gap-2">
                          <div class="mt-2 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600">
                            <GripVertical size={12} />
                          </div>
                          <button
                            draggable="true"
                            aria-label={`Move weekly task ${wInstance.title}`}
                            ondragstart={(event) =>
                              handleBoardDragStart(event, {
                                kind: 'weekly-instance',
                                instanceKey: wInstance.instance_key,
                                week
                              })}
                            ondragend={handleBoardDragEnd}
                            onclick={() => toggleWeeklyInstance(wInstance.instance_key)}
                            class={`w-full rounded-[12px] border px-3 py-1.5 text-left transition-colors ${
                              isWeeklyInstanceCompleted(wInstance.instance_key)
                                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20'
                                : 'border-violet-200/80 bg-violet-50/70 dark:border-violet-500/20 dark:bg-violet-950/18'
                            }`}
                          >
                            <div
                              class={`text-xs font-medium ${
                                isWeeklyInstanceCompleted(wInstance.instance_key)
                                  ? 'text-zinc-400 line-through'
                                  : 'text-violet-800 dark:text-violet-300'
                              }`}
                            >
                              {wInstance.title}
                            </div>
                            <div class="text-[10px] text-violet-500 dark:text-violet-400">
                              {wInstance.estimated_hours ?? 1}h · weekly
                            </div>
                          </button>
                        </div>
                      {/each}
                    </div>
                    {#if cellTasks.length === 0 && weeklyTasks.length === 0}
                      <div class="mt-2 text-xs italic text-zinc-400">No fixed task</div>
                    {/if}
                  </div>
                {/each}
              {/each}
            </div>
          </div>

          <div class="mt-5 rounded-[22px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/16">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              Flexible Monthly Tasks
            </div>
            <div
              role="group"
              ondragover={(event) => allowBoardDrop(event, 'monthly:flexible', canDropMonthlyPayload)}
              ondragleave={() => clearDropZone('monthly:flexible')}
              ondrop={handleFlexibleDrop}
              class={`mt-3 flex min-h-[44px] flex-wrap gap-2 rounded-[18px] transition-colors ${
                activeDropZone === 'monthly:flexible'
                  ? 'bg-amber-100/60 dark:bg-amber-950/18'
                  : ''
              }`}
            >
              {#each monthlyFlexibleInstances as instance (instance.instance_key)}
                <div>
                  <button
                    draggable="true"
                    aria-label={`Move monthly task ${instance.title} to another slot`}
                    ondragstart={(event) =>
                      handleBoardDragStart(event, {
                        kind: 'monthly-instance',
                        instanceKey: instance.instance_key
                      })}
                    ondragend={handleBoardDragEnd}
                    onclick={() => toggleInstance(instance.instance_key)}
                    class={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      isInstanceCompleted(instance.instance_key)
                        ? 'border-emerald-200 bg-emerald-50 text-zinc-500 line-through dark:border-emerald-500/20 dark:bg-emerald-950/20'
                        : 'border-amber-200 bg-white/80 text-zinc-700 dark:border-amber-500/20 dark:bg-zinc-950/60 dark:text-zinc-200'
                    }`}
                  >
                    {instance.title} · {instance.estimated_hours ?? 1}h
                  </button>
                </div>
              {/each}
            </div>
            {#if monthlyFlexibleInstances.length === 0}
              <div class="mt-3 text-xs italic text-zinc-400">No flexible task</div>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
