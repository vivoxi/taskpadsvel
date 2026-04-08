<script lang="ts">
  import { flip } from 'svelte/animate';
  import { tick } from 'svelte';
  import {
    ChevronDown,
    ChevronUp,
    Copy,
    GripVertical,
    Heading1,
    ListChecks,
    Minus,
    Pilcrow,
    Plus,
    Trash2
  } from 'lucide-svelte';
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
    emptyBlockType = 'paragraph',
    insertOrder = ['heading', 'paragraph', 'checklist', 'divider'],
    onCommit
  }: {
    sourceKey: string;
    blocks: PlannerBlock[];
    compact?: boolean;
    emptyLabel?: string;
    emptyBlockType?: PlannerBlock['type'];
    insertOrder?: PlannerBlock['type'][];
    onCommit?: (blocks: PlannerBlock[]) => void | Promise<void>;
  } = $props();

  let localBlocks = $state<PlannerBlock[]>([]);
  let isSaving = $state(false);
  let editorElement = $state<HTMLDivElement | null>(null);
  let activeBlockId = $state<string | null>(null);
  let insertMenuIndex = $state<number | null>(null);
  let slashMenu = $state<{
    blockId: string;
    index: number;
    query: string;
    selected: number;
  } | null>(null);
  const flipDurationMs = $derived(compact ? 120 : 160);
  const availableTypes = $derived(
    [...new Set(insertOrder)].filter(
      (type): type is PlannerBlock['type'] =>
        type === 'heading' || type === 'paragraph' || type === 'checklist' || type === 'divider'
    )
  );

  $effect(() => {
    sourceKey;
    localBlocks = cloneBlocks(blocks);
    activeBlockId = null;
    insertMenuIndex = null;
    slashMenu = null;
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

  async function focusBlock(blockId: string, position: 'start' | 'end' = 'end') {
    await tick();
    const input = editorElement?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-block-input="${blockId}"]`
    );
    if (!input) return;

    input.focus();
    const caret = position === 'start' ? 0 : input.value.length;
    input.setSelectionRange?.(caret, caret);
  }

  function addBlock(type: PlannerBlock['type']) {
    const block = createBlock(type);
    const nextBlocks = [...cloneBlocks(localBlocks), block];
    updateBlock(nextBlocks);
    void commit(nextBlocks);
    void focusBlock(block.id, 'start');
  }

  function insertBlockAt(index: number, type: PlannerBlock['type']) {
    const block = createBlock(type);
    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks.splice(index + 1, 0, block);
    updateBlock(nextBlocks);
    insertMenuIndex = null;
    void commit(nextBlocks);
    if (type !== 'divider') {
      void focusBlock(block.id, 'start');
    } else {
      activeBlockId = block.id;
    }
  }

  function replaceBlockType(index: number, type: PlannerBlock['type']) {
    const target = localBlocks[index];
    if (!target) return;

    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks[index] = {
      ...target,
      type,
      text: type === 'divider' ? '' : '',
      checked: type === 'checklist' ? false : null,
      level: type === 'heading' ? 2 : null
    };
    updateBlock(nextBlocks);
    slashMenu = null;
    void commit(nextBlocks);
    if (type !== 'divider') {
      void focusBlock(target.id, 'start');
    } else {
      activeBlockId = target.id;
    }
  }

  function removeBlock(index: number, requireConfirmation = true) {
    const target = localBlocks[index];
    if (!target) return;

    if (requireConfirmation && !confirm('Are you sure you want to delete this block?')) {
      return;
    }

    const previousBlock = localBlocks[index - 1] ?? null;
    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks.splice(index, 1);
    updateBlock(nextBlocks);
    if (slashMenu?.blockId === target.id) {
      slashMenu = null;
    }
    void commit(nextBlocks);
    if (previousBlock) {
      void focusBlock(previousBlock.id, 'end');
    }
  }

  function getFollowupType(type: PlannerBlock['type']): PlannerBlock['type'] {
    if (type === 'heading') return 'paragraph';
    if (type === 'divider') return 'paragraph';
    return type;
  }

  function duplicateBlock(index: number) {
    const target = localBlocks[index];
    if (!target) return;

    const duplicate: PlannerBlock = {
      ...target,
      id: crypto.randomUUID()
    };

    const nextBlocks = cloneBlocks(localBlocks);
    nextBlocks.splice(index + 1, 0, duplicate);
    updateBlock(nextBlocks);
    void commit(nextBlocks);

    if (duplicate.type !== 'divider') {
      void focusBlock(duplicate.id, 'end');
    } else {
      activeBlockId = duplicate.id;
    }
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

  function openSlashMenu(index: number, text: string) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      if (slashMenu?.index === index) {
        slashMenu = null;
      }
      return;
    }

    slashMenu = {
      blockId: localBlocks[index]?.id ?? crypto.randomUUID(),
      index,
      query: trimmed.slice(1).toLowerCase(),
      selected: 0
    };
  }

  function setBlockText(index: number, text: string) {
    setText(index, text);
    openSlashMenu(index, text);
  }

  function getSlashItems(query: string) {
    if (!query) return availableTypes;
    return availableTypes.filter((type) => labelFor(type).toLowerCase().includes(query));
  }

  function hasSelectionAtStart(element: HTMLInputElement | HTMLTextAreaElement) {
    return (element.selectionStart ?? 0) === 0 && (element.selectionEnd ?? 0) === 0;
  }

  function handleBackspace(
    index: number,
    block: PlannerBlock,
    event: KeyboardEvent & { currentTarget: EventTarget & (HTMLInputElement | HTMLTextAreaElement) }
  ) {
    if (block.text.length > 0) return;
    if (index === 0 || !hasSelectionAtStart(event.currentTarget)) return;

    event.preventDefault();
    removeBlock(index, false);
  }

  function handleEnter(index: number, block: PlannerBlock, event: KeyboardEvent) {
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

    const slashItems =
      slashMenu?.blockId === block.id ? getSlashItems(slashMenu.query) : [];
    if (slashMenu?.blockId === block.id && slashItems.length > 0) {
      event.preventDefault();
      replaceBlockType(index, slashItems[slashMenu.selected] ?? slashItems[0]);
      return;
    }

    event.preventDefault();
    insertBlockAt(index, getFollowupType(block.type));
  }

  function handleKeydown(
    index: number,
    block: PlannerBlock,
    event: KeyboardEvent & { currentTarget: EventTarget & (HTMLInputElement | HTMLTextAreaElement) }
  ) {
    const slashItems =
      slashMenu?.blockId === block.id ? getSlashItems(slashMenu.query) : [];

    if (slashMenu?.blockId === block.id && slashItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        slashMenu = {
          ...slashMenu,
          selected: Math.min(slashMenu.selected + 1, slashItems.length - 1)
        };
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        slashMenu = {
          ...slashMenu,
          selected: Math.max(slashMenu.selected - 1, 0)
        };
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        slashMenu = null;
        return;
      }
    }

    if (event.key === 'Enter') {
      handleEnter(index, block, event);
      return;
    }

    if (event.key === 'Backspace') {
      handleBackspace(index, block, event);
    }
  }

  function labelFor(type: PlannerBlock['type']): string {
    if (type === 'heading') return 'Heading';
    if (type === 'paragraph') return 'Text';
    if (type === 'checklist') return 'Checklist';
    return 'Divider';
  }

  function toggleInsertMenu(index: number) {
    insertMenuIndex = insertMenuIndex === index ? null : index;
  }
</script>

<div bind:this={editorElement} class={`space-y-2 ${compact ? '' : 'space-y-3'}`}>
  {#if localBlocks.length === 0}
    <button
      type="button"
      class="w-full rounded-[18px] border border-dashed border-[var(--border-strong)] bg-[var(--panel-soft)] px-4 py-4 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)]"
      onclick={() => addBlock(emptyBlockType)}
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
        class={`group relative flex items-start gap-2 rounded-[16px] px-1.5 py-1.5 transition-colors ${
          activeBlockId === block.id
            ? 'bg-[var(--panel-soft)] ring-1 ring-[var(--border-strong)]'
            : 'hover:bg-[var(--panel-soft)]/70 focus-within:bg-[var(--panel-soft)]/70'
        }`}
      >
        <div class="mt-0.5 flex items-center gap-0.5 text-[var(--text-faint)]">
          <button
            type="button"
            class={`rounded p-1 transition hover:bg-[var(--panel)] hover:text-[var(--text-primary)] ${
              activeBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            aria-label="Insert block"
            onclick={() => toggleInsertMenu(index)}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            use:dragHandle
            class={`cursor-grab rounded p-1 transition hover:bg-[var(--panel)] active:cursor-grabbing ${
              activeBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            aria-label="Drag block"
          >
            <GripVertical size={14} />
          </button>
        </div>

        <div class="min-w-0 flex-1">
          {#if block.type === 'heading'}
            <input
              data-block-input={block.id}
              value={block.text}
              oninput={(event) => setBlockText(index, (event.currentTarget as HTMLInputElement).value)}
              onkeydown={(event) => handleKeydown(index, block, event)}
              onfocus={() => (activeBlockId = block.id)}
              onblur={handleBlur}
              placeholder="Heading"
              class={`w-full border-none bg-transparent p-0 tracking-[-0.03em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] ${
                compact ? 'text-base font-semibold' : 'text-xl font-semibold'
              }`}
            />
          {:else if block.type === 'paragraph'}
            <textarea
              data-block-input={block.id}
              value={block.text}
              rows={compact ? 2 : 2}
              oninput={(event) => setBlockText(index, (event.currentTarget as HTMLTextAreaElement).value)}
              onkeydown={(event) => handleKeydown(index, block, event)}
              onfocus={() => (activeBlockId = block.id)}
              onblur={handleBlur}
              placeholder="Write a note"
              class="min-h-[2.5rem] w-full resize-none border-none bg-transparent p-0 text-sm leading-6 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-faint)]"
            ></textarea>
          {:else if block.type === 'checklist'}
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                checked={block.checked === true}
                onchange={() => toggleChecklist(index)}
                class="mt-1 h-4 w-4 rounded border-[var(--border-strong)] bg-transparent text-zinc-900 focus:ring-0 dark:text-zinc-100"
              />
              <input
                data-block-input={block.id}
                value={block.text}
                oninput={(event) => setBlockText(index, (event.currentTarget as HTMLInputElement).value)}
                onkeydown={(event) => handleKeydown(index, block, event)}
                onfocus={() => (activeBlockId = block.id)}
                onblur={handleBlur}
                placeholder="Checklist item"
                class={`w-full border-none bg-transparent p-0 text-sm outline-none placeholder:text-[var(--text-faint)] ${
                  block.checked
                    ? 'text-[var(--text-faint)] line-through'
                    : 'text-[var(--text-secondary)]'
                }`}
              />
            </label>
          {:else}
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2 text-left"
              onclick={() => (activeBlockId = block.id)}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  insertBlockAt(index, 'paragraph');
                } else if (event.key === 'Backspace') {
                  event.preventDefault();
                  removeBlock(index, false);
                }
              }}
            >
              <span class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Divider</span>
              <span class="h-px flex-1 bg-[var(--border)]"></span>
            </button>
          {/if}

          {#if slashMenu?.blockId === block.id}
            {@const slashItems = getSlashItems(slashMenu.query)}
            {#if slashItems.length > 0}
              <div class="mt-3 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
                <div class="border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Insert block
                </div>
                <div class="p-2">
                  {#each slashItems as type, slashIndex (type)}
                    <button
                      type="button"
                      class={`flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-sm transition-colors ${
                        slashIndex === slashMenu.selected
                          ? 'bg-[var(--panel-soft)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--panel-soft)]/70 hover:text-[var(--text-primary)]'
                      }`}
                      onmousedown={(event) => {
                        event.preventDefault();
                        replaceBlockType(index, type);
                      }}
                    >
                      {#if type === 'heading'}
                        <Heading1 size={13} />
                      {:else if type === 'paragraph'}
                        <Pilcrow size={13} />
                      {:else}
                        <ListChecks size={13} />
                      {/if}
                      {labelFor(type)}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <div class={`flex items-center gap-0.5 transition ${
          activeBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
        }`}>
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => moveBlock(index, -1)}
            aria-label="Move block up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => moveBlock(index, 1)}
            aria-label="Move block down"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
            onclick={() => duplicateBlock(index)}
            aria-label="Duplicate block"
          >
            <Copy size={14} />
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

        {#if insertMenuIndex === index}
          <div class="absolute left-2 top-full z-10 mt-2 min-w-40 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
            <div class="border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Insert after
            </div>
            <div class="p-2">
              {#each availableTypes as type (type)}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
                  onmousedown={(event) => {
                    event.preventDefault();
                    insertBlockAt(index, type);
                  }}
                >
                  {#if type === 'heading'}
                    <Heading1 size={13} />
                  {:else if type === 'paragraph'}
                    <Pilcrow size={13} />
                  {:else if type === 'divider'}
                    <Minus size={13} />
                  {:else}
                    <ListChecks size={13} />
                  {/if}
                  {labelFor(type)}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 pt-2">
    <span class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
      {isSaving ? 'Saving' : localBlocks.length > 1 ? 'Drag or add block' : `Add ${labelFor(emptyBlockType).toLowerCase()}`}
    </span>
    {#each insertOrder as type (type)}
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={() => addBlock(type)}
      >
        {#if type === 'heading'}
          <Heading1 size={12} />
        {:else if type === 'paragraph'}
          <Pilcrow size={12} />
        {:else if type === 'divider'}
          <Minus size={12} />
        {:else}
          <ListChecks size={12} />
        {/if}
        {labelFor(type)}
      </button>
    {/each}
    <Plus size={12} class="text-[var(--text-faint)]" />
  </div>
</div>
