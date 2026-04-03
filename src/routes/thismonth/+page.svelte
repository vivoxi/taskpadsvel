<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { format } from 'date-fns';
  import { TRIGGERS, dndzone, type DndEvent } from 'svelte-dnd-action';
  import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-svelte';
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
    getWeeklyInstanceStatusStorageKey,
    getWeeklyInstancesStorageKey,
    parsePersistedPeriodInstanceStatus,
    parsePersistedPeriodInstances,
    updateCompletedInstanceKeys,
    type PersistedPeriodTaskInstance
  } from '$lib/periodInstances';
  import { summarizeInstances, summarizeSnapshot } from '$lib/periodSummary';
  import {
    parseScheduleBlockDetails,
    serializeScheduleBlockDetails
  } from '$lib/scheduleBlockDetails';
  import { authPassword } from '$lib/stores';
  import { supabase } from '$lib/supabase';
  import {
    addMonths,
    getMonthKey,
    getMonthWeekKey,
    getPreviousMonthKey,
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

  const currentMonthKey = $derived(getMonthKey(addMonths(today, monthOffset)));
  const isPastMonth = $derived(monthOffset < 0);
  const previousMonthKey = $derived(getPreviousMonthKey(currentMonthKey));
  const monthlyInstancesStorageKey = $derived(getMonthlyInstancesStorageKey(currentMonthKey));
  const monthlyInstanceStatusStorageKey = $derived(
    getMonthlyInstanceStatusStorageKey(currentMonthKey)
  );

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks', 'monthly'] as const,
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

  const weeklyTasksQuery = createQuery(() => ({
    queryKey: ['tasks', 'weekly'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', 'weekly')
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
    queryKey: ['period_instance_status', 'monthly', monthlyInstanceStatusStorageKey] as const,
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

  const weeklyInstanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', 'weekly', currentMonthKey] as const,
    queryFn: async () => {
      const keys = MONTHLY_PLAN_WEEKS.map((w) =>
        getWeeklyInstanceStatusStorageKey(getMonthWeekKey(currentMonthKey, w))
      );
      const { data, error } = await supabase
        .from('user_preferences')
        .select('key, value')
        .in('key', keys);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const row of (data ?? []) as { key: string; value: unknown }[]) {
        const parsed = parsePersistedPeriodInstanceStatus(row.value);
        if (parsed) map[row.key] = parsed.completedInstanceKeys;
      }
      return map;
    },
    enabled: browser && !isPastMonth
  }));

  const weeklyInstancesQuery = createQuery(() => ({
    queryKey: ['thismonth_page', 'weekly_period_instances', currentMonthKey] as const,
    queryFn: async () => {
      const keys = MONTHLY_PLAN_WEEKS.map((week) =>
        getWeeklyInstancesStorageKey(getMonthWeekKey(currentMonthKey, week))
      );
      const { data, error } = await supabase
        .from('user_preferences')
        .select('key, value')
        .in('key', keys);
      if (error) throw error;

      const map: Record<string, PersistedPeriodTaskInstance[]> = {};
      for (const row of (data ?? []) as { key: string; value: unknown }[]) {
        const parsed = parsePersistedPeriodInstances(row.value);
        const periodKey = row.key.replace('period_instances:weekly:', '');
        if (parsed) map[periodKey] = parsed.instances;
      }

      return map;
    },
    enabled: browser && !isPastMonth
  }));

  let monthlyPeriodInstances = $state<PersistedPeriodTaskInstance[]>([]);
  let weeklyPeriodInstancesByWeek = $state<Record<string, PersistedPeriodTaskInstance[]>>({});
  let monthlyCompletedInstanceKeys = $state<string[]>([]);
  let weeklyCompletedByStatusKey = $state<Record<string, string[]>>({});
  let localMonthCells = $state<Record<string, PersistedPeriodTaskInstance[]>>({});
  let localWeeklyCells = $state<Record<string, PersistedPeriodTaskInstance[]>>({});
  let localFlexibleInstances = $state<PersistedPeriodTaskInstance[]>([]);
  let monthlyTemplateSourceItems = $state<PersistedPeriodTaskInstance[]>([]);
  let weeklyTemplateSourceItemsByWeek =
    $state<Record<number, PersistedPeriodTaskInstance[]>>({});
  let isDragging = $state(false);

  const monthlyTemplateInstances = $derived(
    materializeMonthlyTaskInstances(tasksQuery.data ?? [], currentMonthKey).map((instance) => ({
      ...instance,
      id: `monthly-source:${instance.template_id}`,
      instance_key: `monthly-source:${instance.template_id}`,
      carryover: false,
      carryover_source_period_key: null
    }))
  );

  const generatedMonthlyInstances = $derived(
    createMonthlyPeriodInstances({
      monthKey: currentMonthKey,
      monthlyTasks: tasksQuery.data ?? [],
      previousMonthlySnapshot: previousSnapshotQuery.data
    })
  );

  const weeklyTemplateInstancesByWeek = $derived.by(() => {
    const byWeek: Record<number, PersistedPeriodTaskInstance[]> = {};

    for (const weekNum of MONTHLY_PLAN_WEEKS) {
      const weekKey = getMonthWeekKey(currentMonthKey, weekNum);
      byWeek[weekNum] = materializeWeeklyTaskInstances(weeklyTasksQuery.data ?? [], weekKey).map(
        (instance) => ({
          ...instance,
          id: `weekly-source:${weekNum}:${instance.template_id}`,
          instance_key: `weekly-source:${weekNum}:${instance.template_id}`,
          carryover: false,
          carryover_source_period_key: null
        })
      );
    }

    return byWeek;
  });

  const monthlyPlanBoard = $derived(buildMonthlyPlanBoardFromInstances(monthlyPeriodInstances));
  const monthlyInstanceSummary = $derived(
    summarizeInstances(monthlyPeriodInstances, monthlyCompletedInstanceKeys)
  );
  const previousMonthlySummary = $derived(summarizeSnapshot(previousSnapshotQuery.data));
  const monthlyCarryoverTasks = $derived((previousSnapshotQuery.data?.missed_tasks ?? []) as Task[]);

  function getPlannedMonthInstances(): PersistedPeriodTaskInstance[] {
    return [
      ...MONTHLY_PLAN_WEEKS.flatMap((week) =>
        MONTHLY_PLAN_DAYS.flatMap((day) => localMonthCells[getCellKey(week, day)] ?? [])
      ),
      ...localFlexibleInstances
    ].filter((instance) => !instance.instance_key.startsWith('monthly-source:'));
  }

  function getPlannedWeekInstances(week: number): PersistedPeriodTaskInstance[] {
    return MONTHLY_PLAN_DAYS.flatMap(
      (day) => localWeeklyCells[getCellKey(week, day)] ?? []
    ).filter((instance) => !instance.instance_key.startsWith('weekly-source:'));
  }

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
    return getPlannedMonthInstances()
      .filter((instance) => instance.template_id === templateId)
      .reduce((sum, instance) => sum + (instance.estimated_hours ?? 1), 0);
  }

  function getWeeklyAllocatedHours(week: number, templateId: string): number {
    return getPlannedWeekInstances(week)
      .filter((instance) => instance.template_id === templateId)
      .reduce((sum, instance) => sum + (instance.estimated_hours ?? 1), 0);
  }

  function createInstanceCopyId(kind: 'weekly' | 'monthly', templateId: string, periodKey: string): string {
    return `${kind}:${templateId}:${periodKey}:${crypto.randomUUID()}`;
  }

  function createMonthlyInstanceCopy(
    source: PersistedPeriodTaskInstance,
    week: number,
    day: string
  ): PersistedPeriodTaskInstance | null {
    const unitHours = Math.min(1, source.estimated_hours ?? 1);
    if (getMonthlyAllocatedHours(source.template_id) + unitHours > getMonthlyTemplateHourLimit(source.template_id)) {
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
      preferred_day: day as PersistedPeriodTaskInstance['preferred_day'],
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

  function normalizeMonthDropItems(
    week: number,
    day: string,
    items: PersistedPeriodTaskInstance[]
  ): PersistedPeriodTaskInstance[] {
    const nextItems: PersistedPeriodTaskInstance[] = [];

    for (const instance of items) {
      if (instance.instance_key.startsWith('monthly-source:')) {
        const copy = createMonthlyInstanceCopy(instance, week, day);
        if (copy) nextItems.push(copy);
        continue;
      }

      nextItems.push({
        ...instance,
        preferred_week_of_month: week,
        preferred_day: day as PersistedPeriodTaskInstance['preferred_day']
      });
    }

    return nextItems;
  }

  function normalizeWeeklyDropItems(
    week: number,
    day: string,
    items: PersistedPeriodTaskInstance[]
  ): PersistedPeriodTaskInstance[] {
    const weekKey = getMonthWeekKey(currentMonthKey, week);
    const nextItems: PersistedPeriodTaskInstance[] = [];

    for (const instance of items) {
      if (instance.instance_key.startsWith('weekly-source:')) {
        const copy = createWeeklyInstanceCopy(instance, week, day);
        if (copy) nextItems.push(copy);
        continue;
      }

      if (instance.period_key !== weekKey) {
        toast.error('Weekly tasks can only move inside their own week');
        continue;
      }

      nextItems.push({
        ...instance,
        id: instance.instance_key,
        period_key: weekKey,
        preferred_day: day as PersistedPeriodTaskInstance['preferred_day']
      });
    }

    return nextItems;
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
    const nowCompleted = !currentCompleted.includes(instanceKey);
    const nextCompleted = updateCompletedInstanceKeys(currentCompleted, instanceKey, nowCompleted);
    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: statusKey,
        value: { completedInstanceKeys: nextCompleted, updatedAt },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (error) {
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

  function hasCarryover(instance: unknown): boolean {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'carryover' in instance &&
      (instance as { carryover?: unknown }).carryover === true
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
    if (isDragging) return;
    const board = buildMonthlyPlanBoardFromInstances(monthlyPeriodInstances);
    const nextCells: Record<string, PersistedPeriodTaskInstance[]> = {};

    for (const cell of board.cells) {
      nextCells[getCellKey(cell.week, cell.day)] =
        cell.tasks as PersistedPeriodTaskInstance[];
    }

    localMonthCells = nextCells;
    localFlexibleInstances = board.flexibleTasks as PersistedPeriodTaskInstance[];
  });

  $effect(() => {
    if (isDragging) return;

    const nextWeeklyCells: Record<string, PersistedPeriodTaskInstance[]> = {};

    for (const week of MONTHLY_PLAN_WEEKS) {
      const weekKey = getMonthWeekKey(currentMonthKey, week);
      const weekInstances = weeklyPeriodInstancesByWeek[weekKey] ?? [];

      weekInstances.forEach((instance, index) => {
        const day = instance.preferred_day ?? MONTHLY_PLAN_DAYS[index % MONTHLY_PLAN_DAYS.length];
        if (!(MONTHLY_PLAN_DAYS as readonly string[]).includes(day)) return;
        const cellKey = getCellKey(week, day);
        if (!nextWeeklyCells[cellKey]) nextWeeklyCells[cellKey] = [];
        nextWeeklyCells[cellKey].push({
          ...instance,
          preferred_day: day as PersistedPeriodTaskInstance['preferred_day']
        });
      });
    }

    localWeeklyCells = nextWeeklyCells;
  });

  $effect(() => {
    if (isPastMonth || isDragging) {
      return;
    }

    monthlyTemplateSourceItems = monthlyTemplateInstances;
  });

  $effect(() => {
    if (isPastMonth || isDragging) {
      return;
    }

    weeklyTemplateSourceItemsByWeek = weeklyTemplateInstancesByWeek;
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

    await syncScheduleBlocksForInstance(instanceKey, !isInstanceCompleted(instanceKey));

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
    const { data, error } = await supabase
      .from('weekly_schedule')
      .select('id, notes, week_key, day, start_time, end_time, task_title, sort_order')
      .in('week_key', monthWeekKeys);

    if (error) {
      toast.error('This Month updated, but This Week sync failed');
      return;
    }

    const matchingBlocks = ((data ?? []) as ScheduleBlock[]).filter(
      (block) => parseScheduleBlockDetails(block.notes).linkedInstanceKey === instanceKey
    );

    if (matchingBlocks.length === 0) return;

    const results = await Promise.all(
      matchingBlocks.map((block) => {
        const details = parseScheduleBlockDetails(block.notes);
        return supabase
          .from('weekly_schedule')
          .update({
            notes: serializeScheduleBlockDetails(
              details.notes,
              completed,
              details.linkedTaskId,
              details.linkedTaskType,
              details.linkedInstanceKey
            )
          })
          .eq('id', block.id);
      })
    );

    if (results.some((result) => result.error)) {
      toast.error('This Month updated, but This Week sync failed');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule'] });
  }

  function updateCellItems(week: number, day: string, items: PersistedPeriodTaskInstance[]) {
    localMonthCells = {
      ...localMonthCells,
      [getCellKey(week, day)]: normalizeMonthDropItems(week, day, items)
    };
  }

  function updateWeeklyCellItems(
    week: number,
    day: string,
    items: PersistedPeriodTaskInstance[]
  ) {
    localWeeklyCells = {
      ...localWeeklyCells,
      [getCellKey(week, day)]: normalizeWeeklyDropItems(week, day, items)
    };
  }

  async function persistMonthlyInstances() {
    const nextInstances = getPlannedMonthInstances();
    const updatedAt = new Date().toISOString();
    monthlyPeriodInstances = nextInstances;

    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: monthlyInstancesStorageKey,
        value: {
          instances: nextInstances,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (error) {
      toast.error('Failed to save month board order');
      return;
    }

    queryClient.setQueryData(['thismonth_page', 'period_instances', currentMonthKey], {
      instances: nextInstances,
      updatedAt
    });
  }

  async function persistWeeklyInstances(week: number) {
    const weekKey = getMonthWeekKey(currentMonthKey, week);
    const nextWeekInstances = getPlannedWeekInstances(week).map((instance) => ({
      ...instance,
      id: instance.instance_key,
      period_key: weekKey
    }));
    const updatedAt = new Date().toISOString();
    weeklyPeriodInstancesByWeek = {
      ...weeklyPeriodInstancesByWeek,
      [weekKey]: nextWeekInstances
    };

    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: getWeeklyInstancesStorageKey(weekKey),
        value: {
          instances: nextWeekInstances,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (error) {
      toast.error('Failed to save weekly board order');
      return;
    }

    queryClient.setQueryData(['thismonth_page', 'weekly_period_instances', currentMonthKey], {
      ...(weeklyInstancesQuery.data ?? {}),
      [weekKey]: nextWeekInstances
    });
  }

  function handleCellConsider(
    week: number,
    day: string,
    event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>
  ) {
    isDragging = true;
    updateCellItems(week, day, event.detail.items);
  }

  async function handleCellFinalize(
    week: number,
    day: string,
    event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>
  ) {
    updateCellItems(week, day, event.detail.items);

    if (event.detail.info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
      return;
    }

    try {
      await persistMonthlyInstances();
    } finally {
      isDragging = false;
      monthlyTemplateSourceItems = monthlyTemplateInstances;
    }
  }

  function handleWeeklyCellConsider(
    week: number,
    day: string,
    event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>
  ) {
    isDragging = true;
    updateWeeklyCellItems(week, day, event.detail.items);
  }

  async function handleWeeklyCellFinalize(
    week: number,
    day: string,
    event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>
  ) {
    updateWeeklyCellItems(week, day, event.detail.items);

    if (event.detail.info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
      return;
    }

    try {
      await persistWeeklyInstances(week);
    } finally {
      isDragging = false;
      weeklyTemplateSourceItemsByWeek = weeklyTemplateInstancesByWeek;
    }
  }

  function handleFlexibleConsider(event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>) {
    isDragging = true;
    localFlexibleInstances = event.detail.items.map((instance) => ({
      ...instance,
      preferred_week_of_month: null,
      preferred_day: null
    }));
  }

  async function handleFlexibleFinalize(event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>) {
    handleFlexibleConsider(event);

    if (event.detail.info.trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
      return;
    }

    try {
      await persistMonthlyInstances();
    } finally {
      isDragging = false;
      monthlyTemplateSourceItems = monthlyTemplateInstances;
    }
  }

  function handleMonthlySourceConsider(event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>) {
    isDragging = true;
    monthlyTemplateSourceItems = event.detail.items;
  }

  function handleMonthlySourceFinalize() {
    isDragging = false;
    monthlyTemplateSourceItems = monthlyTemplateInstances;
  }

  function handleWeeklySourceConsider(
    week: number,
    event: CustomEvent<DndEvent<PersistedPeriodTaskInstance>>
  ) {
    isDragging = true;
    weeklyTemplateSourceItemsByWeek = {
      ...weeklyTemplateSourceItemsByWeek,
      [week]: event.detail.items
    };
  }

  function handleWeeklySourceFinalize(week: number) {
    isDragging = false;
    weeklyTemplateSourceItemsByWeek = {
      ...weeklyTemplateSourceItemsByWeek,
      [week]: weeklyTemplateInstancesByWeek[week] ?? []
    };
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
              onclick={() => monthOffset += 1}
              class="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
              <div
                use:dndzone={{
                  items: monthlyTemplateSourceItems,
                  flipDurationMs: 150,
                  type: 'monthly-instance'
                }}
                onconsider={handleMonthlySourceConsider}
                onfinalize={handleMonthlySourceFinalize}
                class="mt-3 flex min-h-[44px] flex-wrap gap-2"
              >
                {#each monthlyTemplateSourceItems as sourceItem (sourceItem.instance_key)}
                  <div class="inline-flex cursor-grab items-center gap-2 rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs text-sky-800 active:cursor-grabbing dark:border-sky-500/20 dark:bg-zinc-950/60 dark:text-sky-200">
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
                  <div
                    use:dndzone={{
                      items: weeklyTemplateSourceItemsByWeek[week] ?? [],
                      flipDurationMs: 150,
                      type: `weekly-instance-${week}`
                    }}
                    onconsider={(event) => handleWeeklySourceConsider(week, event)}
                    onfinalize={() => handleWeeklySourceFinalize(week)}
                    class="mt-3 flex min-h-[36px] flex-col gap-1"
                  >
                    {#each weeklyTemplateSourceItemsByWeek[week] ?? [] as sourceItem (sourceItem.instance_key)}
                      <div class="inline-flex cursor-grab items-center gap-1.5 rounded-full border border-violet-200 bg-white/90 px-2 py-1 text-[10px] font-medium text-violet-800 active:cursor-grabbing dark:border-violet-500/20 dark:bg-zinc-950/60 dark:text-violet-200">
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
                  {@const cellTasks = localMonthCells[cellKey] ?? []}
                  {@const weeklyTasks = localWeeklyCells[cellKey] ?? []}
                  <div class="min-h-[120px] rounded-[18px] border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div class="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      {getMonthCellDateLabel(week, day)}
                    </div>
                    <div
                      use:dndzone={{
                        items: cellTasks,
                        flipDurationMs: 150,
                        type: 'monthly-instance',
                        dropTargetStyle: {
                          outline: '2px dashed rgba(14, 165, 233, 0.45)',
                          outlineOffset: '2px'
                        }
                      }}
                      onconsider={(event) => handleCellConsider(week, day, event)}
                      onfinalize={(event) => handleCellFinalize(week, day, event)}
                      class="flex min-h-[76px] flex-col gap-2"
                    >
                      {#each cellTasks as instance (instance.instance_key)}
                        <div class="group flex items-start gap-2">
                          <div class="mt-3 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-600">
                            <GripVertical size={12} />
                          </div>
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
                        </div>
                      {/each}
                    </div>
                    <div
                      use:dndzone={{
                        items: weeklyTasks,
                        flipDurationMs: 150,
                        type: `weekly-instance-${week}`,
                        dropTargetStyle: {
                          outline: '2px dashed rgba(139, 92, 246, 0.45)',
                          outlineOffset: '2px'
                        }
                      }}
                      onconsider={(event) => handleWeeklyCellConsider(week, day, event)}
                      onfinalize={(event) => handleWeeklyCellFinalize(week, day, event)}
                      class="mt-1 flex min-h-[8px] flex-col gap-1"
                    >
                      {#each weeklyTasks as wInstance (wInstance.instance_key)}
                        <div class="group flex items-start gap-2">
                          <div class="mt-2 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-600">
                            <GripVertical size={12} />
                          </div>
                          <button
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
              use:dndzone={{
                items: localFlexibleInstances,
                flipDurationMs: 150,
                type: 'monthly-instance'
              }}
              onconsider={handleFlexibleConsider}
              onfinalize={handleFlexibleFinalize}
              class="mt-3 flex min-h-[44px] flex-wrap gap-2"
            >
              {#each localFlexibleInstances as instance (instance.instance_key)}
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
            {#if localFlexibleInstances.length === 0}
              <div class="mt-3 text-xs italic text-zinc-400">No flexible task</div>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
