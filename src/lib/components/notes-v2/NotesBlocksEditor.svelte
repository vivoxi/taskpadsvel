<script lang="ts">
  import { tick } from 'svelte';
  import { createNoteBlock } from '$lib/notes-v2/validation';
  import type { NoteBlock, NoteBlockType } from '$lib/notes-v2/types';

  type Props = {
    blocks: NoteBlock[];
    disabled?: boolean;
    onchange: (blocks: NoteBlock[]) => void;
    onblur: () => void;
  };

  let { blocks, disabled = false, onchange, onblur }: Props = $props();

  let slashOpen = $state(false);
  let slashCursor = $state(0);
  let slashTargetIdx = $state(0);

  const slashOptions: Array<{ type: NoteBlockType; label: string }> = [
    { type: 'paragraph', label: 'Text' },
    { type: 'heading', label: 'Heading' },
    { type: 'checklist', label: 'Checklist' },
    { type: 'bullet', label: 'Bullet' },
    { type: 'divider', label: 'Divider' }
  ];

  // Plain array — mutated by bind:this, accessed imperatively only
  let inputEls: (HTMLInputElement | HTMLTextAreaElement | null)[] = [];

  const blockIds = $derived(blocks.map((b) => b.id).join(','));

  $effect(() => {
    blockIds;
    tick().then(() => {
      for (const el of inputEls) {
        if (el instanceof HTMLTextAreaElement) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      }
    });
  });

  export function focusFirst() {
    tick().then(() => inputEls[0]?.focus());
  }

  function emit(next: NoteBlock[]) {
    onchange(next);
  }

  async function focusAt(index: number, toEnd = true) {
    await tick();
    const el = inputEls[index];
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(toEnd ? len : 0, toEnd ? len : 0);
  }

  function convertBlock(i: number, type: NoteBlockType, text: string) {
    const existing = blocks[i];
    const next = { ...createNoteBlock(type), id: existing.id, text } as NoteBlock;
    emit(blocks.map((b, idx) => (idx === i ? next : b)));
    tick().then(() => {
      const el = inputEls[i];
      if (el) {
        el.value = text;
        el.focus();
      }
    });
  }

  function handleInput(i: number, e: Event) {
    const el = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    const text = el.value;

    if (el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    if (text === '# ') { convertBlock(i, 'heading', ''); return; }
    if (text === '- ') { convertBlock(i, 'bullet', ''); return; }
    if (text === '[] ' || text === '[ ] ') { convertBlock(i, 'checklist', ''); return; }

    if (text === '/') {
      slashOpen = true;
      slashCursor = 0;
      slashTargetIdx = i;
    } else if (slashOpen && slashTargetIdx === i) {
      slashOpen = false;
    }

    emit(blocks.map((b, idx) => (idx === i ? ({ ...b, text } as NoteBlock) : b)));
  }

  function handleKeydown(i: number, e: KeyboardEvent) {
    const el = e.currentTarget as HTMLInputElement | HTMLTextAreaElement;

    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashCursor = (slashCursor + 1) % slashOptions.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashCursor = (slashCursor - 1 + slashOptions.length) % slashOptions.length;
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applySlash(slashOptions[slashCursor].type);
        return;
      }
      if (e.key === 'Escape') {
        slashOpen = false;
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentType = blocks[i].type;
      const newType: NoteBlockType =
        currentType === 'checklist' ? 'checklist'
        : currentType === 'bullet' ? 'bullet'
        : 'paragraph';
      const newBlock = createNoteBlock(newType);
      const next = [...blocks];
      next.splice(i + 1, 0, newBlock);
      emit(next);
      focusAt(i + 1, false);
      return;
    }

    if (e.key === 'Backspace' && el.value === '' && blocks.length > 1) {
      e.preventDefault();
      emit(blocks.filter((_, idx) => idx !== i));
      focusAt(Math.max(0, i - 1));
      return;
    }

    if (e.key === 'ArrowUp' && el.selectionStart === 0 && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    }

    if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && i < blocks.length - 1) {
      e.preventDefault();
      focusAt(i + 1, false);
    }
  }

  function applySlash(type: NoteBlockType) {
    slashOpen = false;
    convertBlock(slashTargetIdx, type, '');
  }

  function toggleCheck(i: number) {
    const block = blocks[i];
    if (block.type !== 'checklist') return;
    emit(blocks.map((b, idx) => (idx === i ? ({ ...b, checked: !block.checked } as NoteBlock) : b)));
  }

  function insertBelow(i: number) {
    const newBlock = createNoteBlock('paragraph');
    const next = [...blocks];
    next.splice(i + 1, 0, newBlock);
    emit(next);
    focusAt(i + 1, false);
  }
</script>

<div class="relative pl-8">
  {#each blocks as block, i (block.id)}
    <div
      class="group relative"
      onmouseenter={() => {}}
      onmouseleave={() => {}}
      role="none"
    >
      <!-- Hover controls: drag handle + insert below -->
      <div class="pointer-events-none absolute -left-8 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <span
          class="cursor-grab rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-secondary)]"
          role="img"
          aria-label="Drag handle"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
            <circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/>
            <circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/>
          </svg>
        </span>
        <button
          type="button"
          class="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--panel)] hover:text-[var(--text-secondary)]"
          tabindex="-1"
          aria-label="Insert block below"
          onclick={() => insertBelow(i)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
          </svg>
        </button>
      </div>

      <!-- Block content -->
      <div class="relative min-w-0">
        {#if block.type === 'heading'}
          <input
            bind:this={inputEls[i]}
            class="w-full border-none bg-transparent py-1 text-2xl font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            placeholder="Heading"
            value={block.text}
            {disabled}
            oninput={(e) => handleInput(i, e)}
            onkeydown={(e) => handleKeydown(i, e)}
            onblur={onblur}
          />
        {:else if block.type === 'paragraph'}
          <textarea
            bind:this={inputEls[i]}
            class="w-full resize-none overflow-hidden border-none bg-transparent py-0.5 text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            placeholder="Type something, or '/' for commands…"
            rows={1}
            value={block.text}
            {disabled}
            oninput={(e) => handleInput(i, e)}
            onkeydown={(e) => handleKeydown(i, e)}
            onblur={onblur}
          ></textarea>
        {:else if block.type === 'checklist'}
          <div class="flex items-center gap-2.5 py-0.5">
            <button
              type="button"
              class="h-4 w-4 flex-shrink-0 rounded border transition-colors {block.checked
                ? 'border-[var(--accent)] bg-[var(--accent)]'
                : 'border-[var(--border-strong)] bg-transparent hover:border-[var(--accent)]'}"
              onclick={() => toggleCheck(i)}
              {disabled}
              aria-label={block.checked ? 'Mark incomplete' : 'Mark complete'}
            >
              {#if block.checked}
                <svg viewBox="0 0 12 12" fill="none" class="h-full w-full p-0.5">
                  <path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </button>
            <input
              bind:this={inputEls[i]}
              class="min-w-0 flex-1 border-none bg-transparent py-0.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] {block.checked
                ? 'text-[var(--text-muted)] line-through'
                : ''}"
              placeholder="To-do"
              value={block.text}
              {disabled}
              oninput={(e) => handleInput(i, e)}
              onkeydown={(e) => handleKeydown(i, e)}
              onblur={onblur}
            />
          </div>
        {:else if block.type === 'bullet'}
          <div class="flex items-start gap-2.5 py-0.5">
            <span class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--text-secondary)]"></span>
            <input
              bind:this={inputEls[i]}
              class="min-w-0 flex-1 border-none bg-transparent py-0.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              placeholder="List item"
              value={block.text}
              {disabled}
              oninput={(e) => handleInput(i, e)}
              onkeydown={(e) => handleKeydown(i, e)}
              onblur={onblur}
            />
          </div>
        {:else if block.type === 'divider'}
          <div class="py-3" role="none">
            <hr class="border-t border-[var(--border)]" />
          </div>
        {/if}

        <!-- Slash command menu -->
        {#if slashOpen && slashTargetIdx === i}
          <div class="absolute left-0 top-full z-50 mt-1 w-52 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-strong)] p-1 shadow-[var(--shadow-card)]">
            {#each slashOptions as option, oi}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors {slashCursor === oi
                  ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'}"
                onmousedown={() => applySlash(option.type)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/each}

  {#if blocks.length === 0}
    <button
      type="button"
      class="w-full py-2 text-left text-sm text-[var(--text-faint)] hover:text-[var(--text-muted)]"
      {disabled}
      onclick={() => {
        emit([createNoteBlock('paragraph')]);
        tick().then(() => inputEls[0]?.focus());
      }}
    >
      Click to start writing…
    </button>
  {/if}
</div>
