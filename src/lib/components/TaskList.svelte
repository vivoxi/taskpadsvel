<script module lang="ts">
  const checkedResetPeriods = new Set<string>();
  const resetInFlightPeriods = new Set<string>();
  const TASK_ORDER_STORAGE_PREFIX = 'task-order:';
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import { CheckSquare2, Filter, GripVertical, ListTodo, Square, Trash2 } from 'lucide-svelte';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import TaskRow from './TaskRow.svelte';
  import {
    getMonthlyInstanceStatusStorageKey,
    getWeeklyInstanceStatusStorageKey,
    parsePersistedPeriodInstanceStatus,
    updateCompletedInstanceKeys
  } from '$lib/periodInstances';
  import { parseScheduleBlockDetails, serializeScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import { parseTaskDetails, serializeTaskDetails } from '$lib/taskDetails';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { getWeekKey, getMonthKey } from '$lib/weekUtils';
  import { takeSnapshot } from '$lib/snapshot';
  import type { ScheduleBlock, Task, TaskAttachment, TaskType } from '$lib/types';

  let {
    type,
    showResetButton = false,
    templateMode = false
  }: {
    type: TaskType;
    showResetButton?: boolean;
    templateMode?: boolean;
  } = $props();

  const queryClient = useQueryClient();
  const weekKey = getWeekKey();
  const monthKey = getMonthKey();
  const taskOrderStorageKey = $derived(`${TASK_ORDER_STORAGE_PREFIX}${type}`);

  // --- Queries ---
  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks', type] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', type)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    }
  }));

  const taskIds = $derived((tasksQuery.data ?? []).map((task) => task.id));
  const taskIdsKey = $derived(taskIds.join(','));

  const attachmentsQuery = createQuery(() => ({
    queryKey: ['attachments', type, taskIdsKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .in('task_id', taskIds);
      if (error) throw error;
      return (data ?? []) as TaskAttachment[];
    },
    enabled: tasksQuery.isSuccess && taskIds.length > 0
  }));

  const instanceStatusStorageKey = $derived(
    type === 'weekly'
      ? getWeeklyInstanceStatusStorageKey(weekKey)
      : type === 'monthly'
        ? getMonthlyInstanceStatusStorageKey(monthKey)
        : null
  );

  const instanceStatusQuery = createQuery(() => ({
    queryKey: ['period_instance_status', type, instanceStatusStorageKey] as const,
    queryFn: async () => {
      if (!instanceStatusStorageKey) return null;
      const { data, error } = await supabase
        .from('user_preferences')
        .select('value')
        .eq('key', instanceStatusStorageKey)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
    enabled: !templateMode && type !== 'random'
  }));

  let taskOrder = $state<string[]>([]);
  let taskOrderLoaded = $state(false);
  let localTasks = $state<Task[]>([]);
  let taskFilter = $state<'all' | 'active' | 'completed'>('all');
  let autoEditTaskId = $state<string | null>(null);

  $effect(() => {
    if (!browser || taskOrderLoaded) return;

    // Instant local fallback while Supabase loads
    try {
      const cached = localStorage.getItem(taskOrderStorageKey);
      if (cached) taskOrder = JSON.parse(cached) as string[];
    } catch { /* ignore */ }

    supabase
      .from('user_preferences')
      .select('value')
      .eq('key', taskOrderStorageKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && Array.isArray(data.value)) {
          taskOrder = data.value as string[];
        }
        taskOrderLoaded = true;
      });
  });

  const orderedTasks = $derived.by(() => {
    const tasks = tasksQuery.data ?? [];
    const orderMap = new Map(taskOrder.map((id, index) => [id, index]));

    return [...tasks].sort((a, b) => {
      const aIndex = orderMap.get(a.id);
      const bIndex = orderMap.get(b.id);

      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  });

  $effect(() => {
    if (!taskOrderLoaded) return;

    const currentIds = (tasksQuery.data ?? []).map((task) => task.id);
    const nextOrder = [
      ...taskOrder.filter((id) => currentIds.includes(id)),
      ...currentIds.filter((id) => !taskOrder.includes(id))
    ];

    const changed =
      nextOrder.length !== taskOrder.length ||
      nextOrder.some((id, index) => id !== taskOrder[index]);

    if (changed) {
      taskOrder = nextOrder;
    }
  });

  $effect(() => {
    localTasks = orderedTasks;
  });

  const completionToggleEnabled = $derived(!templateMode);

  const completedInstanceKeys = $derived(
    parsePersistedPeriodInstanceStatus(instanceStatusQuery.data)?.completedInstanceKeys ?? []
  );

  function getInstanceKeyForTask(task: Task): string | null {
    if (task.type === 'weekly') return `weekly:${task.id}:${weekKey}`;
    if (task.type === 'monthly') return `monthly:${task.id}:${monthKey}`;
    return null;
  }

  const displayTasks = $derived(
    localTasks.map((task) => {
      if (!completionToggleEnabled || task.type === 'random') return task;
      const instanceKey = getInstanceKeyForTask(task);
      if (!instanceKey) return task;
      return {
        ...task,
        completed: completedInstanceKeys.includes(instanceKey)
      };
    })
  );

  function isTaskVisible(task: Task): boolean {
    if (taskFilter === 'active') return !task.completed;
    if (taskFilter === 'completed') return task.completed;
    return true;
  }

  const visibleTasks = $derived(displayTasks.filter((task) => isTaskVisible(task)));

  $effect(() => {
    if (!browser || !taskOrderLoaded) return;
    localStorage.setItem(taskOrderStorageKey, JSON.stringify(taskOrder));
    supabase
      .from('user_preferences')
      .upsert({ key: taskOrderStorageKey, value: taskOrder, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(({ error }) => { if (error) console.error('Failed to save task order', error); });
  });

  const completedCount = $derived(displayTasks.filter((t) => t.completed).length);
  const totalCount = $derived(displayTasks.length);
  const progressValue = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

  function getAttachmentsForTask(taskId: string): TaskAttachment[] {
    return (attachmentsQuery.data ?? []).filter((a) => a.task_id === taskId);
  }

  function handleTaskOrderConsider(event: CustomEvent<DndEvent<Task>>) {
    localTasks = event.detail.items;
  }

  function handleTaskOrderFinalize(event: CustomEvent<DndEvent<Task>>) {
    localTasks = event.detail.items;
    taskOrder = localTasks.map((task) => task.id);
  }

  async function addTaskBelow(
    anchorTaskId: string,
    indentLevel: number,
    category: string | null
  ) {
    const payload = serializeTaskDetails('', null, null, null, category, indentLevel);
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: '',
        type,
        completed: false,
        notes: payload
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      toast.error('Failed to add task');
      return;
    }

    taskOrder = [
      ...taskOrder.flatMap((taskId) => (taskId === anchorTaskId ? [taskId, data.id] : [taskId])),
      ...(taskOrder.includes(anchorTaskId) ? [] : [data.id])
    ];
    taskFilter = 'all';
    autoEditTaskId = data.id;
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  // --- Auto-reset on mount (Weekly/Monthly only) ---
  let resetChecked = $state(false);
  const currentPeriodKey = $derived(type === 'weekly' ? getWeekKey() : getMonthKey());
  const resetCacheKey = $derived(`${type}:${currentPeriodKey}`);

  $effect(() => {
    if (type === 'random' || templateMode || resetChecked) return;
    if (checkedResetPeriods.has(resetCacheKey) || resetInFlightPeriods.has(resetCacheKey)) {
      resetChecked = true;
      return;
    }
    checkAndReset();
  });

  async function checkAndReset() {
    resetChecked = true;
    const resetType = type as 'weekly' | 'monthly';
    const currentKey = currentPeriodKey;

    if (checkedResetPeriods.has(resetCacheKey) || resetInFlightPeriods.has(resetCacheKey)) return;
    resetInFlightPeriods.add(resetCacheKey);

    try {
      const { data: logRow } = await supabase
        .from('reset_log')
        .select('last_reset_key')
        .eq('type', resetType)
        .maybeSingle();

      if (logRow && logRow.last_reset_key === currentKey) {
        checkedResetPeriods.add(resetCacheKey);
        return;
      }

      if (logRow?.last_reset_key) {
        await takeSnapshot(resetType, logRow.last_reset_key);
      }

      await supabase.from('tasks').update({ completed: false }).eq('type', type);
      await supabase
        .from('reset_log')
        .upsert({ type: resetType, last_reset_key: currentKey }, { onConflict: 'type' });

      checkedResetPeriods.add(resetCacheKey);
      queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    } catch (err) {
      resetChecked = false;
      toast.error('Reset failed');
      console.error(err);
    } finally {
      resetInFlightPeriods.delete(resetCacheKey);
    }
  }

  // --- Add task ---
  let newTitle = $state('');

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    newTitle = '';

    const { error } = await supabase
      .from('tasks')
      .insert({ title, type, completed: false, notes: '' });

    if (error) {
      toast.error('Failed to add task');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  async function setAllTasksCompleted(completed: boolean) {
    if (!completionToggleEnabled || totalCount === 0) return;

    if (type === 'random') {
      const { error } = await supabase.from('tasks').update({ completed }).eq('type', type);
      if (error) {
        toast.error('Failed to update tasks');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['tasks', type] });
      return;
    }

    if (!instanceStatusStorageKey) return;
    const nextCompletedInstanceKeys = completed
      ? displayTasks
          .map((task) => getInstanceKeyForTask(task))
          .filter((item): item is string => Boolean(item))
      : [];
    const updatedAt = new Date().toISOString();

    const { error } = await supabase.from('user_preferences').upsert(
      {
        key: instanceStatusStorageKey,
        value: {
          completedInstanceKeys: nextCompletedInstanceKeys,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (error) {
      toast.error('Failed to update tasks');
      return;
    }

    queryClient.setQueryData(['period_instance_status', type, instanceStatusStorageKey], {
      completedInstanceKeys: nextCompletedInstanceKeys,
      updatedAt
    });
  }

  async function clearCompletedTasks() {
    if (!completionToggleEnabled) return;
    const completedTasks = displayTasks.filter((task) => task.completed);
    if (completedTasks.length === 0) return;
    if (!confirm(`Delete ${completedTasks.length} completed task(s)?`)) return;

    for (const task of completedTasks) {
      await deleteTask(task.id, false);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addTask();
  }

  // --- Toggle ---
  async function syncScheduleCompletionForTask(task: Task, completed: boolean) {
    const { data: scheduleBlocks, error: fetchError } = await supabase
      .from('weekly_schedule')
      .select('id, week_key, day, start_time, end_time, task_title, notes, sort_order')
      .eq('week_key', weekKey);

    if (fetchError) throw fetchError;

    const directMatches = (scheduleBlocks ?? []).filter((block) => {
      const details = parseScheduleBlockDetails(block.notes);
      if (details.linkedTaskId) return details.linkedTaskId === task.id;
      return details.linkedTaskType === task.type && block.task_title === task.title;
    });

    const fallbackMatches =
      directMatches.length > 0
        ? directMatches
        : (scheduleBlocks ?? []).filter((block) => {
            const details = parseScheduleBlockDetails(block.notes);
            return !details.linkedTaskId && block.task_title === task.title;
          });

    if (fallbackMatches.length === 0) return;

    const updatedBlocks = fallbackMatches.map((block) => {
      const details = parseScheduleBlockDetails(block.notes);
      return {
        ...block,
        notes: serializeScheduleBlockDetails(
          details.notes,
          completed,
          details.linkedTaskId,
          details.linkedTaskType,
          details.linkedInstanceKey
        )
      };
    });

    const updates = updatedBlocks.map((block) =>
      supabase.from('weekly_schedule').update({ notes: block.notes }).eq('id', block.id)
    );

    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error);
    if (failedUpdate?.error) throw failedUpdate.error;

    queryClient.setQueryData<ScheduleBlock[]>(
      ['weekly_schedule', weekKey],
      (previous) =>
        previous?.map((block) => updatedBlocks.find((item) => item.id === block.id) ?? block) ?? previous
    );
    queryClient.invalidateQueries({ queryKey: ['weekly_schedule', weekKey] });
  }

  async function toggleTask(id: string, completed: boolean) {
    const task = (tasksQuery.data ?? []).find((entry) => entry.id === id);
    if (!task) return;

    if (!completionToggleEnabled) return;

    if (task.type !== 'random') {
      if (!instanceStatusStorageKey) return;

      const nextCompletedInstanceKeys = updateCompletedInstanceKeys(
        completedInstanceKeys,
        getInstanceKeyForTask(task) ?? '',
        completed
      );
      const updatedAt = new Date().toISOString();

      const { error } = await supabase.from('user_preferences').upsert(
        {
          key: instanceStatusStorageKey,
          value: {
            completedInstanceKeys: nextCompletedInstanceKeys,
            updatedAt
          },
          updated_at: updatedAt
        },
        { onConflict: 'key' }
      );

      if (error) {
        toast.error('Failed to update task');
        return;
      }

      queryClient.setQueryData(['period_instance_status', type, instanceStatusStorageKey], {
        completedInstanceKeys: nextCompletedInstanceKeys,
        updatedAt
      });

      try {
        await syncScheduleCompletionForTask(task, completed);
      } catch (syncError) {
        console.error(syncError);
        toast.error('Task updated, but schedule sync failed');
      }

      return;
    }

    let password = '';
    const unsub = authPassword.subscribe((value) => (password = value));
    unsub();

    const res = await fetch(`/api/task/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(password ? { Authorization: `Bearer ${password}` } : {})
      },
      body: JSON.stringify({ completed })
    });

    if (!res.ok) {
      toast.error('Failed to update task');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
  }

  async function updateTaskTitle(id: string, title: string) {
    let password = '';
    const unsub = authPassword.subscribe((value) => (password = value));
    unsub();

    const res = await fetch(`/api/task/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(password ? { Authorization: `Bearer ${password}` } : {})
      },
      body: JSON.stringify({ title })
    });

    if (!res.ok) {
      toast.error('Failed to update task');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  async function deleteTask(id: string, askConfirmation = true) {
    const task = displayTasks.find((entry) => entry.id === id);
    if (askConfirmation && !confirm(`Delete "${task?.title || 'this task'}"?`)) return;

    let password = '';
    const unsub = authPassword.subscribe((value) => (password = value));
    unsub();

    const res = await fetch(`/api/task/${id}`, {
      method: 'DELETE',
      headers: password ? { Authorization: `Bearer ${password}` } : {}
    });

    if (!res.ok) {
      toast.error('Failed to delete task');
      return;
    }

    taskOrder = taskOrder.filter((taskId) => taskId !== id);
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    queryClient.invalidateQueries({ queryKey: ['attachments', type] });
    toast.success('Task deleted');
  }

  // --- Reset all (Random only) ---
  async function resetAll() {
    await supabase.from('tasks').update({ completed: false }).eq('type', type);
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    toast.success('All tasks reset');
  }

  // --- Attachment callbacks ---
  function onAttachmentAdded(_: TaskAttachment) {
    queryClient.invalidateQueries({ queryKey: ['attachments', type] });
  }

  function onAttachmentDeleted(_: string) {
    queryClient.invalidateQueries({ queryKey: ['attachments', type] });
  }
</script>

<div class="flex flex-col gap-4 max-w-2xl mx-auto">
  <!-- Progress bar -->
  {#if completionToggleEnabled}
    <div class="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <ListTodo size={15} />
          {completedCount} of {totalCount} complete
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            onclick={() => setAllTasksCompleted(completedCount !== totalCount)}
            class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            {#if completedCount === totalCount && totalCount > 0}
              <Square size={13} />
              Uncheck all
            {:else}
              <CheckSquare2 size={13} />
              Check all
            {/if}
          </button>
          <button
            onclick={clearCompletedTasks}
            class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300"
          >
            <Trash2 size={13} />
            Clear completed
          </button>
        </div>
      </div>
      <Progress value={progressValue} class="h-2 w-full" />
      <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <Filter size={12} />
        {#each ['all', 'active', 'completed'] as filterOption}
          <button
            onclick={() => (taskFilter = filterOption as typeof taskFilter)}
            class={`rounded-full px-3 py-1 transition-colors ${
              taskFilter === filterOption
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-white text-zinc-500 hover:text-zinc-900 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {filterOption}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Task list -->
  {#if tasksQuery.isLoading}
    <div class="text-sm text-zinc-400 py-4 text-center">Loading…</div>
  {:else if tasksQuery.error}
    <div class="text-sm text-red-500 py-4 text-center">
      Failed to load tasks.
    </div>
  {:else}
    <div
      use:dragHandleZone={{ items: visibleTasks, flipDurationMs: 150, dragDisabled: taskFilter !== 'all' }}
      onconsider={handleTaskOrderConsider}
      onfinalize={handleTaskOrderFinalize}
      class="flex min-h-12 flex-col divide-y divide-zinc-100 dark:divide-zinc-800"
    >
      {#each visibleTasks as task (task.id)}
        <div class="group flex items-start gap-2">
          <div class="relative pt-2">
            <button
              type="button"
              use:dragHandle
              class={`rounded-md px-1 py-1 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600 ${
              taskFilter === 'all'
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-not-allowed'
              }`}
              aria-label="Task actions and drag handle"
            >
              <GripVertical size={14} />
            </button>
            <div
              class="pointer-events-none absolute left-5 top-1 z-20 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
            >
              <button
                type="button"
                onclick={() => deleteTask(task.id)}
                class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <TaskRow
              {task}
              attachments={getAttachmentsForTask(task.id)}
              autoEditTitle={autoEditTaskId === task.id}
              showCompletionToggle={completionToggleEnabled}
              {weekKey}
              onToggle={toggleTask}
              onTitleUpdate={updateTaskTitle}
              onDeleteTask={deleteTask}
              onInsertTaskBelow={addTaskBelow}
              onAutoEditConsumed={() => {
                autoEditTaskId = null;
              }}
              {onAttachmentAdded}
              {onAttachmentDeleted}
            />
          </div>
        </div>
      {/each}
    </div>

    {#if visibleTasks.length === 0}
      <div class="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-800">
        No tasks in this view.
      </div>
    {/if}
  {/if}

  <!-- Add task input -->
  <input
    type="text"
    bind:value={newTitle}
    onkeydown={onKeydown}
    placeholder="Add task… (Enter to save)"
    class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 caret-zinc-900 dark:caret-zinc-100 outline-none focus:ring-1 focus:ring-zinc-400 placeholder:text-zinc-400"
  />

  <!-- Reset all (Random only) -->
  {#if showResetButton}
    <button
      onclick={resetAll}
      class="self-start text-xs text-zinc-400 hover:text-red-500 transition-colors"
    >
      Reset all
    </button>
  {/if}
</div>
