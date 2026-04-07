<script lang="ts">
  import { flip } from 'svelte/animate';
  import { GripVertical, Heading1, ListChecks, Pilcrow, Plus, Trash2 } from 'lucide-svelte';
  import {
    dragHandle,
    dragHandleZone,
    type DndEvent
  } from 'svelte-dnd-action';
  import { cloneBlocks, createBlock } from '$lib/planner/blocks';
  import type { PlannerBlock } from '$lib/planner/types';

  let {
    sourceKey,
    blocks,
    compact = false,
    emptyLabel = 'Start writing',
    onCommit
  }: {
    sourceKey: string;
    blocks: PlannerBlock[];
    compact?: boolean;
    emptyLabel?: string;
    onCommit?: (blocks: PlannerBlock[]) => void | Promise<void>;
  } = $props();

  let localBlocks = $state<PlannerBlock[]>([]);
  let isSaving = $state(false);
  const flipDurationMs = $derived(compact ? 120 : 160);

  $effect(() => {
    sourceKey;
    localBlocks = cloneBlocks(blocks);
  });

  function updateBlock(nextBlocks: PlannerBlock[]) {
    localBlocks = nextBlocks;
  }

  function handleDndReorder(event: CustomEvent<DndEvent<PlannerBlock>>) {
    updateBlock(cloneBlocks(event.detail.items));
  }

  function finalizeDndReorder(event: CustomEvent<DndEvent<PlannerBlock>>) {
    const nextBlocks = cloneBlocks(event.detail.items);
    updateBlock(nextBlocks);
    void commit(nextBlocks);
  }

  async function commit(nextBlocks = localBlocks) {
    if (!onCommit) return;
    isSaving = true;

    try {
      await onCommit(cloneBlocks(nextBlocks));
    } finally {
      isSaving = false;
    }
  }

  function setText(index: number, text: string) {
    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks[index] = {
      ...nextBlocks[index],
      text
    };
    updateBlock(nextBlocks);
  }

  function toggleChecklist(index: number) {
    const target = localBlocks[index];
    if (!target || target.type !== 'checklist') return;

    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks[index] = {
      ...target,
      checked: !(target.checked === true)
    };
    updateBlock(nextBlocks);
    void commit(nextBlocks);
  }

  function addBlock(type: PlannerBlock['type']) {
    const nextBlocks = [...cloneBlocks(localBlocks), createBlock(type)];
    updateBlock(nextBlocks);
    void commit(nextBlocks);
  }

  function removeBlock(index: number) {
    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks.splice(index, 1);
    updateBlock(nextBlocks);
    void commit(nextBlocks);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= localBlocks.length) return;

    const nextBlocks = cloneBlocks(localBlocks);
    const [moved] = nextBlocks.splice(index, 1);
    nextBlocks.splice(targetIndex, 0, moved);
    updateBlock(nextBlocks);
    void commit(nextBlocks);
  }

  function handleBlur() {
    void commit();
  }
</script>

<div class={`space-y-2 ${compact ? '' : 'space-y-3'}`}>
  {#if localBlocks.length === 0}
    <button
      type="button"
      class="w-full rounded-[18px] border border-dashed border-[var(--border-strong)] bg-[var(--panel-soft)] px-4 py-4 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)]"
      onclick={() => addBlock('paragraph')}
    >
      {emptyLabel}
    </button>
  {/if}

  <div
    use:dragHandleZone={{ items: localBlocks, flipDurationMs, dragDisabled: localBlocks.length < 2 }}
    onconsider={handleDndReorder}
    onfinalize={finalizeDndReorder}
    class="space-y-2"
  >
    {#each localBlocks as block, index (block.id)}
      <div
        animate:flip={{ duration: flipDurationMs }}
        class="group flex items-start gap-3 rounded-[18px] px-2 py-2 transition-colors hover:bg-[var(--panel-soft)]/80"
      >
        <div class="mt-1 flex items-center gap-1 text-[var(--text-faint)]">
          <button
            type="button"
            use:dragHandle
            class="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--panel)] cursor-grab active:cursor-grabbing"
            aria-label="Drag block"
          >
            <GripVertical size={14} />
          </button>
        </div>

        <div class="min-w-0 flex-1">
          {#if block.type === 'heading'}
            <input
              value={block.text}
              oninput={(event) => setText(index, (event.currentTarget as HTMLInputElement).value)}
              onblur={handleBlur}
              placeholder="Heading"
              class={`w-full border-none bg-transparent p-0 tracking-[-0.03em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] ${
                compact ? 'text-base font-semibold' : 'text-xl font-semibold'
              }`}
            />
          {:else if block.type === 'paragraph'}
            <textarea
              value={block.text}
              rows={compact ? 2 : 3}
              oninput={(event) => setText(index, (event.currentTarget as HTMLTextAreaElement).value)}
              onblur={handleBlur}
              placeholder="Write a note"
              class="min-h-[3rem] w-full resize-none border-none bg-transparent p-0 text-sm leading-7 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-faint)]"
            ></textarea>
          {:else}
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                checked={block.checked === true}
                onchange={() => toggleChecklist(index)}
                class="mt-1 h-4 w-4 rounded border-[var(--border-strong)] bg-transparent text-zinc-900 focus:ring-0 dark:text-zinc-100"
              />
              <input
                value={block.text}
                oninput={(event) => setText(index, (event.currentTarget as HTMLInputElement).value)}
                onblur={handleBlur}
                placeholder="Checklist item"
                class={`w-full border-none bg-transparent p-0 text-sm outline-none placeholder:text-[var(--text-faint)] ${
                  block.checked
                    ? 'text-[var(--text-faint)] line-through'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
            </label>
          {/if}
        </div>

        <div class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => moveBlock(index, -1)}
            aria-label="Move block up"
          >
            <GripVertical size={14} class="rotate-180" />
          </button>
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => moveBlock(index, 1)}
            aria-label="Move block down"
          >
            <GripVertical size={14} />
          </button>
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => removeBlock(index)}
            aria-label="Delete block"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 pt-2">
    <span class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
      {isSaving ? 'Saving' : localBlocks.length > 1 ? 'Drag or add block' : 'Add block'}
    </span>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      onclick={() => addBlock('heading')}
    >
      <Heading1 size={12} />
      Heading
    </button>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      onclick={() => addBlock('paragraph')}
    >
      <Pilcrow size={12} />
      Text
    </button>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      onclick={() => addBlock('checklist')}
    >
      <ListChecks size={12} />
      Checklist
    </button>
    <Plus size={12} class="text-[var(--text-faint)]" />
  </div>
</div>
