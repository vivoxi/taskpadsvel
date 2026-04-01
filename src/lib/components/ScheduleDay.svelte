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
    getLinkedTaskForBlock,
    getAttachmentsForBlock,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    day: string;
    blocks: ScheduleBlock[];
    weekKey: string;
    readonly?: boolean;
    onBlocksReordered: (day: string, reordered: ScheduleBlock[]) => void;
    onMoveBlockDay: (block: ScheduleBlock, targetDay: string) => Promise<void> | void;
    onBlockUpdated: (updated: ScheduleBlock) => void;
    getLinkedTaskForBlock: (block: ScheduleBlock) => { id: string; type: TaskType } | null;
    getAttachmentsForBlock: (block: ScheduleBlock) => TaskAttachment[];
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  let localBlocks = $state<ScheduleBlock[]>([]);

  $effect(() => {
    localBlocks = [...blocks];
  });

  function handleDndConsider(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    localBlocks = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    localBlocks = e.detail.items;
    onBlocksReordered(day, localBlocks);

    // Persist sort_order
    const updates = localBlocks.map((b, i) =>
      supabase.from('weekly_schedule').update({ sort_order: i }).eq('id', b.id)
    );
    await Promise.all(updates);
  }

  function onUpdate(updated: ScheduleBlock) {
    localBlocks = localBlocks.map((b) => (b.id === updated.id ? updated : b));
    onBlockUpdated(updated);
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
      use:dndzone={{ items: localBlocks, flipDurationMs: 150 }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="flex flex-col gap-1.5 min-h-[20px]"
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
            {onAttachmentAdded}
            {onAttachmentDeleted}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>
