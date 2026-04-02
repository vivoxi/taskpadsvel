<script lang="ts">
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { supabase } from '$lib/supabase';
  import ScheduleBlockCard from './ScheduleBlockCard.svelte';
  import type { ScheduleBlock, TaskAttachment, TaskType } from '$lib/types';

  let {
    day,
    blocks,
    weekKey,
    readonly = false,
    onBlocksReordered,
    onMoveBlockDay,
    onBlockUpdated,
    onDeleteBlock,
    onAddBlock,
    getLinkedTaskForBlock,
    getAttachmentsForBlock,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    day: string;
    blocks: ScheduleBlock[];
    weekKey: string;
    readonly?: boolean;
    onBlocksReordered: (day: string, reordered: ScheduleBlock[]) => Promise<void> | void;
    onMoveBlockDay: (block: ScheduleBlock, targetDay: string) => Promise<void> | void;
    onBlockUpdated: (updated: ScheduleBlock) => void;
    onDeleteBlock?: (id: string) => void;
    onAddBlock?: (day: string, draft: { start_time: string; end_time: string; task_title: string; notes: string }) => void;
    getLinkedTaskForBlock: (block: ScheduleBlock) => { id: string; type: TaskType } | null;
    getAttachmentsForBlock: (block: ScheduleBlock) => TaskAttachment[];
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  let localBlocks = $state<ScheduleBlock[]>([]);
  let showAddForm = $state(false);
  let draftStart = $state('10:00');
  let draftEnd = $state('11:00');
  let draftTitle = $state('');
  let draftNotes = $state('');

  $effect(() => {
    localBlocks = [...blocks];
  });

  function handleDndConsider(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    const { items } = e.detail;
    localBlocks = items;
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    const { items } = e.detail;

    // Check if any block was moved from another day
    const movedFromAnotherDay = items.find(item =>
      item.day !== day && blocks.every(b => b.id !== item.id)
    );

    if (movedFromAnotherDay && onMoveBlockDay) {
      // A block was dropped from another day onto this day
      await onMoveBlockDay(movedFromAnotherDay, day);
      // Don't update localBlocks here - let the query invalidation handle it
      return;
    }

    // Check if a block was dragged out to another day
    const removedBlock = blocks.find(b =>
      items.every(item => item.id !== b.id)
    );

    if (removedBlock) {
      // Block was dragged out, but we'll let moveBlockToDay handle the update
      return;
    }

    // Normal reorder within the same day
    localBlocks = items;
    await onBlocksReordered(day, localBlocks);
  }

  function onUpdate(updated: ScheduleBlock) {
    localBlocks = localBlocks.map((b) => (b.id === updated.id ? updated : b));
    onBlockUpdated(updated);
  }

  function submitAddBlock() {
    if (!draftTitle.trim() || !draftStart || !draftEnd) return;
    onAddBlock?.(day, {
      start_time: draftStart,
      end_time: draftEnd,
      task_title: draftTitle.trim(),
      notes: draftNotes.trim()
    });
    draftTitle = '';
    draftNotes = '';
    draftStart = '10:00';
    draftEnd = '11:00';
    showAddForm = false;
  }
</script>

<div class="flex flex-col gap-2">
  <h4 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
    {day}
  </h4>

  {#if localBlocks.length === 0}
    <p class="text-xs text-zinc-400 italic py-1">No blocks scheduled</p>
  {:else if readonly}
    <div class="flex flex-col gap-1.5">
      {#each localBlocks as block (block.id)}
        <ScheduleBlockCard
          {block}
          attachments={getAttachmentsForBlock(block)}
          resolvedTaskId={getLinkedTaskForBlock(block)?.id ?? null}
          {weekKey}
          {readonly}
          onUpdate={() => {}}
          {onAttachmentAdded}
          {onAttachmentDeleted}
        />
      {/each}
    </div>
  {:else}
    <div
      use:dndzone={{
        items: localBlocks,
        flipDurationMs: 150,
        dropTargetStyle: { outline: '2px dashed rgba(249, 115, 22, 0.5)', outlineOffset: '2px' },
        type: 'schedule-block'
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="flex flex-col gap-1.5 min-h-[60px] rounded-lg p-1 transition-colors"
    >
      {#each localBlocks as block (block.id)}
        <div class="cursor-grab active:cursor-grabbing">
          <ScheduleBlockCard
            {block}
            attachments={getAttachmentsForBlock(block)}
            resolvedTaskId={getLinkedTaskForBlock(block)?.id ?? null}
            {weekKey}
            {readonly}
            {onUpdate}
            onMoveDay={onMoveBlockDay}
            onDelete={onDeleteBlock}
            {onAttachmentAdded}
            {onAttachmentDeleted}
          />
        </div>
      {/each}
    </div>
  {/if}

  {#if !readonly && onAddBlock}
    {#if showAddForm}
      <div class="mt-2 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div class="flex gap-2">
          <input
            bind:value={draftStart}
            type="text"
            placeholder="10:00"
            class="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          />
          <span class="self-center text-xs text-zinc-400">–</span>
          <input
            bind:value={draftEnd}
            type="text"
            placeholder="11:00"
            class="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          />
        </div>
        <input
          bind:value={draftTitle}
          type="text"
          placeholder="Block title"
          onkeydown={(e) => { if (e.key === 'Enter') submitAddBlock(); if (e.key === 'Escape') showAddForm = false; }}
          class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        />
        <div class="flex gap-2">
          <button
            onclick={submitAddBlock}
            type="button"
            class="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add
          </button>
          <button
            onclick={() => { showAddForm = false; }}
            type="button"
            class="rounded-md px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
          >
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <button
        onclick={() => { showAddForm = true; }}
        type="button"
        class="mt-1 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <span class="text-base leading-none">+</span> Add block
      </button>
    {/if}
  {/if}
</div>
