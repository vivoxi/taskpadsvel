<script module lang="ts">
  const checkedResetPeriods = new Set<string>();
  const resetInFlightPeriods = new Set<string>();
  const TASK_ORDER_STORAGE_PREFIX = 'task-order:';
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { GripVertical } from 'lucide-svelte';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import TaskRow from './TaskRow.svelte';
  import { parseScheduleBlockDetails, serializeScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { getWeekKey, getMonthKey } from '$lib/weekUtils';
  import { takeSnapshot } from '$lib/snapshot';
  import type { ScheduleBlock, Task, TaskAttachment, TaskType } from '$lib/types';

  let {
    type,
    showResetButton = false
  }: {
    type: TaskType;
    showResetButton?: boolean;
  } = $props();

  const queryClient = useQueryClient();
  const weekKey = getWeekKey();
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

  let taskOrder = $state<string[]>([]);
  let taskOrderLoaded = $state(false);
  let localTasks = $state<Task[]>([]);

  $effect(() => {
    if (!browser || taskOrderLoaded) return;
    try {
      const stored = localStorage.getItem(taskOrderStorageKey);
      taskOrder = stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      taskOrder = [];
    } finally {
      taskOrderLoaded = true;
    }
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

  $effect(() => {
    if (!browser || !taskOrderLoaded) return;
    localStorage.setItem(taskOrderStorageKey, JSON.stringify(taskOrder));
  });

  const completedCount = $derived((tasksQuery.data ?? []).filter((t) => t.completed).length);
  const totalCount = $derived((tasksQuery.data ?? []).length);
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

  // --- Auto-reset on mount (Weekly/Monthly only) ---
  let resetChecked = $state(false);
  const currentPeriodKey = $derived(type === 'weekly' ? getWeekKey() : getMonthKey());
  const resetCacheKey = $derived(`${type}:${currentPeriodKey}`);

  $effect(() => {
    if (type === 'random' || resetChecked) return;
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
          details.linkedTaskType
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
    const { error } = await supabase.from('tasks').update({ completed }).eq('id', id);
    if (error) {
      toast.error('Failed to update task');
      return;
    }

    if (task && task.type !== 'random') {
      try {
        await syncScheduleCompletionForTask(task, completed);
      } catch (syncError) {
        console.error(syncError);
        toast.error('Task updated, but schedule sync failed');
      }
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
  }

  async function updateTaskTitle(id: string, title: string) {
    const { error } = await supabase.from('tasks').update({ title }).eq('id', id);
    if (error) {
      toast.error('Failed to update task');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  async function deleteTask(id: string) {
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
  <div class="flex items-center gap-3">
    <Progress value={progressValue} class="flex-1 h-2" />
    <span class="text-sm text-zinc-500 dark:text-zinc-400 shrink-0">
      {completedCount}/{totalCount}
    </span>
  </div>

  <!-- Task list -->
  {#if tasksQuery.isLoading}
    <div class="text-sm text-zinc-400 py-4 text-center">Loading…</div>
  {:else}
    <div
      use:dndzone={{ items: localTasks, flipDurationMs: 150 }}
      onconsider={handleTaskOrderConsider}
      onfinalize={handleTaskOrderFinalize}
      class="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800"
    >
      {#each localTasks as task (task.id)}
        <div class="flex items-start gap-2 group">
          <div class="pt-3 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical size={14} />
          </div>
          <div class="min-w-0 flex-1">
            <TaskRow
              {task}
              attachments={getAttachmentsForTask(task.id)}
              {weekKey}
              onToggle={toggleTask}
              onTitleUpdate={updateTaskTitle}
              onDeleteTask={deleteTask}
              {onAttachmentAdded}
              {onAttachmentDeleted}
            />
          </div>
        </div>
      {/each}
    </div>
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
