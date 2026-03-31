<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import type { ScheduleBlock } from '$lib/types';

  let {
    block,
    readonly = false,
    onUpdate
  }: {
    block: ScheduleBlock;
    readonly?: boolean;
    onUpdate: (updated: ScheduleBlock) => void;
  } = $props();

  type EditableField = 'start_time' | 'end_time' | 'task_title' | 'notes';

  let editingField = $state<EditableField | null>(null);
  let editValue = $state('');

  function startEdit(field: EditableField) {
    if (readonly) return;
    editingField = field;
    editValue = String(block[field]);
  }

  async function commitEdit() {
    if (!editingField) return;
    const field = editingField;
    const value = editValue;
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
</script>

<div class="group flex flex-col gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm cursor-default">
  <!-- Time range -->
  <div class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
    {#if editingField === 'start_time'}
      <input
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
        autofocus
      />
    {:else}
      <button onclick={() => startEdit('start_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.start_time}
      </button>
    {/if}
    <span>–</span>
    {#if editingField === 'end_time'}
      <input
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
        autofocus
      />
    {:else}
      <button onclick={() => startEdit('end_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.end_time}
      </button>
    {/if}
  </div>

  <!-- Title -->
  {#if editingField === 'task_title'}
    <input
      type="text"
      bind:value={editValue}
      onblur={commitEdit}
      onkeydown={onKeydown}
      class="font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-zinc-400 outline-none w-full"
      autofocus
    />
  {:else}
    <button
      onclick={() => startEdit('task_title')}
      class="text-left font-medium text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    >
      {block.task_title}
    </button>
  {/if}

  <!-- Notes -->
  {#if block.notes || editingField === 'notes'}
    {#if editingField === 'notes'}
      <textarea
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        rows={2}
        class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-zinc-300 dark:border-zinc-600 rounded px-1 outline-none resize-none w-full"
        autofocus
      ></textarea>
    {:else}
      <button
        onclick={() => startEdit('notes')}
        class="text-left text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {block.notes}
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
</div>
