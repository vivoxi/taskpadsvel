<script lang="ts">
  import { useQueryClient } from '@tanstack/svelte-query';
  import {
    getPeriodInstanceStatusStorageKey,
    parsePeriodInstanceKey,
    parsePersistedPeriodInstanceStatus,
    updateCompletedInstanceKeys
  } from '$lib/periodInstances';
  import { parseScheduleBlockDetails, serializeScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import { DAY_NAMES } from '$lib/weekUtils';
  import { Trash2 } from 'lucide-svelte';
  import AttachmentManager from './AttachmentManager.svelte';
  import type { TaskType } from '$lib/types';
  import type { ScheduleBlock, TaskAttachment } from '$lib/types';

  let {
    block,
    attachments = [],
    resolvedTaskId = null,
    weekKey,
    readonly = false,
    onUpdate,
    onMoveDay,
    onDelete,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    block: ScheduleBlock;
    attachments?: TaskAttachment[];
    resolvedTaskId?: string | null;
    weekKey: string;
    readonly?: boolean;
    onUpdate: (updated: ScheduleBlock) => void;
    onMoveDay?: (block: ScheduleBlock, targetDay: string) => Promise<void> | void;
    onDelete?: (id: string) => void;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  const queryClient = useQueryClient();

  type EditableField = 'start_time' | 'end_time' | 'task_title' | 'notes';

  let editingField = $state<EditableField | null>(null);
  let editValue = $state('');
  let editFieldRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
  let displayNotes = $state('');
  let completed = $state(false);
  let selectedDay = $state('');
  let linkedTaskId = $state<string | null>(null);
  let linkedTaskType = $state<TaskType | null>(null);
  let linkedInstanceKey = $state<string | null>(null);

  $effect(() => {
    const details = parseScheduleBlockDetails(block.notes);
    displayNotes = details.notes;
    completed = details.completed;
    selectedDay = block.day;
    linkedTaskId = details.linkedTaskId;
    linkedTaskType = details.linkedTaskType;
    linkedInstanceKey = details.linkedInstanceKey;
  });

  $effect(() => {
    if (!editingField || !editFieldRef) return;
    editFieldRef.focus();
    if ('select' in editFieldRef) {
      editFieldRef.select();
    }
  });

  function startEdit(field: EditableField) {
    if (readonly) return;
    editingField = field;
    editValue = field === 'notes' ? displayNotes : String(block[field]);
  }

  async function commitEdit() {
    if (!editingField) return;
    const field = editingField;
    const value =
      field === 'notes'
        ? serializeScheduleBlockDetails(
            editValue,
            completed,
            linkedTaskId,
            linkedTaskType,
            linkedInstanceKey
          )
        : editValue;
    editingField = null;

    const updated = { ...block, [field]: value };
    onUpdate(updated);

    const { error } = await supabase
      .from('weekly_schedule')
      .update({ [field]: value })
      .eq('id', block.id);

    if (error) toast.error('Failed to save');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && editingField !== 'notes') {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === 'Escape') {
      editingField = null;
    }
  }

  async function toggleCompleted() {
    if (readonly) return;

    const nextCompleted = !completed;
    const nextNotes = serializeScheduleBlockDetails(
      displayNotes,
      nextCompleted,
      linkedTaskId,
      linkedTaskType,
      linkedInstanceKey
    );
    const updated = { ...block, notes: nextNotes };

    completed = nextCompleted;
    onUpdate(updated);

    const { error } = await supabase
      .from('weekly_schedule')
      .update({ notes: nextNotes })
      .eq('id', block.id);

    if (error) {
      completed = !nextCompleted;
      onUpdate(block);
      toast.error('Failed to save');
      return;
    }

    try {
      await syncInstanceCompletion(updated);
    } catch (syncError) {
      console.error(syncError);
      toast.error('Schedule updated, but task sync failed');
    }
  }

  async function syncInstanceCompletion(updatedBlock: ScheduleBlock) {
    if (!linkedInstanceKey) return;

    const parsedInstanceKey = parsePeriodInstanceKey(linkedInstanceKey);
    if (!parsedInstanceKey) return;

    const { data: matchingBlocks, error: blocksError } = await supabase
      .from('weekly_schedule')
      .select('id, notes');

    if (blocksError) throw blocksError;

    const parsedBlock = parseScheduleBlockDetails(updatedBlock.notes);
    const allCompleted = (matchingBlocks ?? [])
      .filter((row) => {
        if (row.id === updatedBlock.id) return true;
        return parseScheduleBlockDetails(row.notes).linkedInstanceKey === linkedInstanceKey;
      })
      .every((row) => {
        if (row.id === updatedBlock.id) return parsedBlock.completed;
        return parseScheduleBlockDetails(row.notes).completed;
      });

    const storageKey = getPeriodInstanceStatusStorageKey(
      parsedInstanceKey.periodType,
      parsedInstanceKey.periodKey
    );

    const { data, error } = await supabase
      .from('user_preferences')
      .select('value')
      .eq('key', storageKey)
      .maybeSingle();

    if (error) throw error;

    const persisted = parsePersistedPeriodInstanceStatus(data?.value);
    const completedInstanceKeys = updateCompletedInstanceKeys(
      persisted?.completedInstanceKeys ?? [],
      linkedInstanceKey,
      allCompleted
    );

    const updatedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from('user_preferences').upsert(
      {
        key: storageKey,
        value: {
          completedInstanceKeys,
          updatedAt
        },
        updated_at: updatedAt
      },
      { onConflict: 'key' }
    );

    if (saveError) throw saveError;

    queryClient.setQueryData(['period_instance_status', parsedInstanceKey.periodType, storageKey], {
      completedInstanceKeys,
      updatedAt
    });
  }

  async function handleMoveDay(event: Event) {
    const targetDay = (event.target as HTMLSelectElement).value;
    selectedDay = targetDay;

    if (!onMoveDay || targetDay === block.day) return;
    await onMoveDay(block, targetDay);
  }
</script>

<div class="group flex gap-3 rounded-md border px-3 py-2 text-sm cursor-default
  {completed
    ? 'border-green-200 dark:border-green-900 bg-green-50/40 dark:bg-green-950/20'
    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'}
  relative">
  <button
    onclick={toggleCompleted}
    disabled={readonly}
    class="mt-0.5 shrink-0 h-5 w-5 rounded-full border-2 transition-colors flex items-center justify-center
      {completed
        ? 'bg-orange-500 border-orange-500 dark:bg-orange-400 dark:border-orange-400'
        : 'border-zinc-400 dark:border-zinc-600 hover:border-zinc-600 dark:hover:border-zinc-400'}
      {readonly ? 'cursor-default' : 'cursor-pointer'}"
    aria-label={completed ? 'Mark schedule item incomplete' : 'Mark schedule item complete'}
  >
    {#if completed}
      <svg viewBox="0 0 10 10" class="w-3 h-3" fill="none">
        <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {/if}
  </button>

  <div class="flex flex-1 flex-col gap-1 min-w-0">
  <!-- Time range + delete button -->
  <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
    <div class="flex flex-1 items-center gap-2">
    {#if !readonly}
      <select
        value={selectedDay}
        oninput={handleMoveDay}
        class="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-400"
        aria-label="Move schedule item to day"
      >
        {#each DAY_NAMES as day}
          <option value={day}>{day}</option>
        {/each}
      </select>
    {/if}
    {#if editingField === 'start_time'}
      <input
        bind:this={editFieldRef}
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
      />
    {:else}
      <button onclick={() => startEdit('start_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.start_time}
      </button>
    {/if}
    <span>–</span>
    {#if editingField === 'end_time'}
      <input
        bind:this={editFieldRef}
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
      />
    {:else}
      <button onclick={() => startEdit('end_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.end_time}
      </button>
    {/if}
    </div>
    {#if !readonly && onDelete}
      <button
        onclick={() => onDelete!(block.id)}
        class="ml-auto shrink-0 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
        title="Delete block"
        type="button"
      >
        <Trash2 size={13} />
      </button>
    {/if}
  </div>

  <!-- Title -->
  {#if editingField === 'task_title'}
    <input
      bind:this={editFieldRef}
      type="text"
      bind:value={editValue}
      onblur={commitEdit}
      onkeydown={onKeydown}
      class="font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-zinc-400 outline-none w-full"
    />
  {:else}
    <button
      onclick={() => startEdit('task_title')}
      class="text-left font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors
        {completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}"
    >
      {block.task_title}
    </button>
  {/if}

  <!-- Notes -->
  {#if displayNotes || editingField === 'notes'}
    {#if editingField === 'notes'}
      <textarea
        bind:this={editFieldRef}
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        rows={2}
        class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-zinc-300 dark:border-zinc-600 rounded px-1 outline-none resize-none w-full"
      ></textarea>
    {:else}
      <button
        onclick={() => startEdit('notes')}
        class="text-left text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {displayNotes}
      </button>
    {/if}
  {:else if !readonly}
    <button
      onclick={() => startEdit('notes')}
      class="hidden group-hover:block text-left text-xs text-zinc-300 dark:text-zinc-600 hover:text-zinc-500"
    >
      + notes
    </button>
  {/if}

  {#if attachments.length > 0 || !readonly}
    <AttachmentManager
      {attachments}
      taskId={resolvedTaskId}
      {weekKey}
      {readonly}
      {onAttachmentAdded}
      {onAttachmentDeleted}
    />
  {/if}
  </div>
</div>
