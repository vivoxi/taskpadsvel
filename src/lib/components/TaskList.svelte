<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import TaskRow from './TaskRow.svelte';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { getWeekKey, getMonthKey } from '$lib/weekUtils';
  import { takeSnapshot } from '$lib/snapshot';
  import type { Task, TaskAttachment, TaskType } from '$lib/types';

  let {
    type,
    showResetButton = false
  }: {
    type: TaskType;
    showResetButton?: boolean;
  } = $props();

  const queryClient = useQueryClient();
  const weekKey = getWeekKey();

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

  const attachmentsQuery = createQuery(() => ({
    queryKey: ['attachments', type] as const,
    queryFn: async () => {
      const tasks = tasksQuery.data ?? [];
      if (tasks.length === 0) return [] as TaskAttachment[];
      const ids = (tasks as Task[]).map((t) => t.id);
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .in('task_id', ids);
      if (error) throw error;
      return (data ?? []) as TaskAttachment[];
    }
  }));

  // Sorted: incomplete first
  const sortedTasks = $derived(
    [...(tasksQuery.data ?? [])].sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    })
  );

  const completedCount = $derived((tasksQuery.data ?? []).filter((t) => t.completed).length);
  const totalCount = $derived((tasksQuery.data ?? []).length);
  const progressValue = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

  function getAttachmentsForTask(taskId: string): TaskAttachment[] {
    return (attachmentsQuery.data ?? []).filter((a) => a.task_id === taskId);
  }

  // --- Auto-reset on mount (Weekly/Monthly only) ---
  let resetChecked = $state(false);

  $effect(() => {
    if (type === 'random' || resetChecked) return;
    checkAndReset();
  });

  async function checkAndReset() {
    resetChecked = true;
    const resetType = type as 'weekly' | 'monthly';
    const currentKey =
      type === 'weekly' ? getWeekKey() : getMonthKey();

    const { data: logRow } = await supabase
      .from('reset_log')
      .select('last_reset_key')
      .eq('type', resetType)
      .maybeSingle();

    if (logRow && logRow.last_reset_key === currentKey) return;

    try {
      await takeSnapshot(resetType);
      await supabase.from('tasks').update({ completed: false }).eq('type', type);
      await supabase
        .from('reset_log')
        .upsert({ type: resetType, last_reset_key: currentKey }, { onConflict: 'type' });

      queryClient.invalidateQueries({ queryKey: ['tasks', type] });
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} tasks reset for new period`);
    } catch (err) {
      toast.error('Reset failed');
      console.error(err);
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
  async function toggleTask(id: string, completed: boolean) {
    await supabase.from('tasks').update({ completed }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
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
    <div class="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      {#each sortedTasks as task (task.id)}
        <TaskRow
          {task}
          attachments={getAttachmentsForTask(task.id)}
          {weekKey}
          onToggle={toggleTask}
          {onAttachmentAdded}
          {onAttachmentDeleted}
        />
      {/each}
    </div>
  {/if}

  <!-- Add task input -->
  <input
    type="text"
    bind:value={newTitle}
    onkeydown={onKeydown}
    placeholder="Add task… (Enter to save)"
    class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 placeholder:text-zinc-400"
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
