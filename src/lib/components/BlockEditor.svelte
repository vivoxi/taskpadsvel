<script lang="ts">
  import { flip } from 'svelte/animate';
  import { tick } from 'svelte';
  import {
    Bold,
    Code,
    Copy,
    GripVertical,
    Heading1,
    Italic,
    Link2,
    ListChecks,
    Minus,
    Pilcrow,
    Plus,
    Strikethrough,
    Trash2
  } from 'lucide-svelte';
  import {
    dragHandle,
    dragHandleZone,
    type DndEvent
  } from 'svelte-dnd-action';
  import { cloneBlocks, createBlock } from '$lib/planner/blocks';
  import { showConfirm } from '$lib/stores/confirm';
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
  let editingBlockId = $state<string | null>(null);
  let blockMenuId = $state<string | null>(null);
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
    editingBlockId = null;
    blockMenuId = null;
    slashMenu = null;
  });

  // ── Legacy markdown → HTML migration ─────────────────────────────────────
  // Existing blocks may have text stored as markdown (**bold**).
  // We detect that case and convert once; after the first edit the block is
  // saved as HTML and the conversion is never needed again.

  function escapeHtml(t: string) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function markdownToHtml(text: string): string {
    if (!text.trim()) return '';
    let h = escapeHtml(text);
    h = h.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    h = h.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
    h = h.replace(/~~(.+?)~~/gs, '<s>$1</s>');
    h = h.replace(/`([^`\n]+?)`/g, '<code class="rounded bg-[var(--panel-soft)] px-1 font-mono text-[0.85em] text-[var(--text-primary)]">$1</code>');
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline underline-offset-2 hover:opacity-80">$1</a>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  /** Return text ready to set as innerHTML.
   *  If it already contains HTML tags it is returned as-is;
   *  otherwise it is treated as legacy markdown and converted. */
  function toHtml(text: string): string {
    if (/<\/?(?:strong|em|s|code|a|br)\b/.test(text)) return text;
    return markdownToHtml(text);
  }

  // ── Svelte action: keep innerHTML in sync without resetting the cursor ────

  function htmlContent(el: HTMLElement, text: string) {
    el.innerHTML = toHtml(text);
    return {
      update(next: string) {
        // While the element is focused the user is typing — don't touch innerHTML.
        if (document.activeElement !== el) {
          el.innerHTML = toHtml(next);
        }
      }
    };
  }

  // ── Block operations ──────────────────────────────────────────────────────

  function updateBlock(next: PlannerBlock[]) { localBlocks = next; }

  function handleDndReorder(e: CustomEvent<DndEvent<PlannerBlock>>) {
    updateBlock(cloneBlocks(e.detail.items));
  }

  function finalizeDndReorder(e: CustomEvent<DndEvent<PlannerBlock>>) {
    const next = cloneBlocks(e.detail.items);
    updateBlock(next);
    void commit(next);
  }

  async function commit(next = localBlocks) {
    if (!onCommit) return;
    isSaving = true;
    try { await onCommit(cloneBlocks(next)); } finally { isSaving = false; }
  }

  function setText(index: number, text: string) {
    const next = cloneBlocks(localBlocks);
    next[index] = { ...next[index], text };
    updateBlock(next);
  }

  function toggleChecklist(index: number) {
    const t = localBlocks[index];
    if (!t || t.type !== 'checklist') return;
    const next = cloneBlocks(localBlocks);
    next[index] = { ...t, checked: !t.checked };
    updateBlock(next);
    void commit(next);
  }

  async function focusBlock(blockId: string, position: 'start' | 'end' = 'end') {
    editingBlockId = blockId;
    await tick();
    const el = editorElement?.querySelector<HTMLElement>(`[data-block-input="${blockId}"]`);
    if (!el) return;
    el.focus();

    if (el instanceof HTMLInputElement) {
      const c = position === 'start' ? 0 : el.value.length;
      el.setSelectionRange(c, c);
    } else {
      // contenteditable
      const range = document.createRange();
      const sel = window.getSelection();
      if (!sel) return;
      try {
        if (position === 'end') {
          range.selectNodeContents(el);
          range.collapse(false);
        } else {
          range.setStart(el, 0);
          range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      } catch { /* empty element edge case */ }
    }
  }

  function addBlock(type: PlannerBlock['type']) {
    const block = createBlock(type);
    const next = [...cloneBlocks(localBlocks), block];
    updateBlock(next);
    void commit(next);
    void focusBlock(block.id, 'start');
  }

  function insertBlockAt(index: number, type: PlannerBlock['type']) {
    const block = createBlock(type);
    const next = cloneBlocks(localBlocks);
    next.splice(index + 1, 0, block);
    updateBlock(next);
    void commit(next);
    if (type !== 'divider') void focusBlock(block.id, 'start');
    else activeBlockId = block.id;
  }

  function replaceBlockType(index: number, type: PlannerBlock['type']) {
    const target = localBlocks[index];
    if (!target) return;
    const next = cloneBlocks(localBlocks);
    next[index] = { ...target, type, text: '', checked: type === 'checklist' ? false : null, level: type === 'heading' ? 2 : null };
    updateBlock(next);
    slashMenu = null;
    void commit(next);
    if (type !== 'divider') void focusBlock(target.id, 'start');
    else activeBlockId = target.id;
  }

  async function removeBlock(index: number, requireConfirmation = true) {
    const target = localBlocks[index];
    if (!target) return;
    if (requireConfirmation && !await showConfirm('This block will be permanently deleted.', 'Delete block?')) return;
    const prev = localBlocks[index - 1] ?? null;
    const next = cloneBlocks(localBlocks);
    next.splice(index, 1);
    updateBlock(next);
    if (slashMenu?.blockId === target.id) slashMenu = null;
    void commit(next);
    if (prev) void focusBlock(prev.id, 'end');
  }

  function getFollowupType(type: PlannerBlock['type']): PlannerBlock['type'] {
    if (type === 'heading' || type === 'divider') return 'paragraph';
    return type;
  }

  function duplicateBlock(index: number) {
    const target = localBlocks[index];
    if (!target) return;
    const dup: PlannerBlock = { ...target, id: crypto.randomUUID() };
    const next = cloneBlocks(localBlocks);
    next.splice(index + 1, 0, dup);
    updateBlock(next);
    void commit(next);
    if (dup.type !== 'divider') void focusBlock(dup.id, 'end');
    else activeBlockId = dup.id;
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const ti = index + direction;
    if (ti < 0 || ti >= localBlocks.length) return;
    const next = cloneBlocks(localBlocks);
    const [moved] = next.splice(index, 1);
    next.splice(ti, 0, moved);
    updateBlock(next);
    void commit(next);
  }

  // ── Slash menu ────────────────────────────────────────────────────────────

  function openSlashMenu(index: number, plainText: string) {
    const trimmed = plainText.trim();
    if (!trimmed.startsWith('/')) {
      if (slashMenu?.index === index) slashMenu = null;
      return;
    }
    slashMenu = {
      blockId: localBlocks[index]?.id ?? crypto.randomUUID(),
      index,
      query: trimmed.slice(1).toLowerCase(),
      selected: 0
    };
  }

  function getSlashItems(query: string) {
    if (!query) return availableTypes;
    return availableTypes.filter((t) => labelFor(t).toLowerCase().includes(query));
  }

  // ── WYSIWYG formatting (paragraph / contenteditable) ──────────────────────

  function applyFmt(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
  }

  function applyCode() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement('code');
    code.className = 'rounded bg-[var(--panel-soft)] px-1 font-mono text-[0.85em] text-[var(--text-primary)]';
    try {
      range.surroundContents(code);
    } catch {
      applyFmt('insertHTML', `<code class="rounded bg-[var(--panel-soft)] px-1 font-mono text-[0.85em] text-[var(--text-primary)]">${escapeHtml(range.toString())}</code>`);
    }
  }

  function applyLink() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const selectedText = sel.toString();
    const url = window.prompt('URL:', 'https://');
    if (!url) return;
    applyFmt('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline underline-offset-2 hover:opacity-80">${selectedText || 'Link'}</a>`);
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  /** Called on every keystroke inside a paragraph contenteditable. */
  function onParaInput(index: number, el: HTMLDivElement) {
    // Browser may leave a bare <br> when all content is deleted — normalise to empty.
    const html = el.innerHTML === '<br>' ? '' : el.innerHTML;
    if (html !== el.innerHTML) el.innerHTML = '';
    setText(index, html);
    openSlashMenu(index, el.textContent ?? '');
  }

  /** Smart paste: URL pasted over selection → inline link.
   *  Plain-text paste → strip any external HTML styling. */
  function onParaPaste(event: ClipboardEvent & { currentTarget: HTMLDivElement }) {
    const plain = event.clipboardData?.getData('text/plain') ?? '';
    const sel = window.getSelection();

    if (sel && !sel.isCollapsed && /^https?:\/\/\S+$/.test(plain.trim())) {
      event.preventDefault();
      applyFmt('insertHTML', `<a href="${plain.trim()}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline underline-offset-2 hover:opacity-80">${escapeHtml(sel.toString())}</a>`);
      return;
    }

    // Strip external HTML — only allow plain text.
    if (event.clipboardData?.types.includes('text/html')) {
      event.preventDefault();
      applyFmt('insertText', plain);
    }
  }

  function handleBackspace(index: number, block: PlannerBlock, el: HTMLElement) {
    const empty =
      block.type === 'paragraph'
        ? !(el.textContent ?? '').trim()
        : !block.text;
    if (!empty || index === 0) return;
    removeBlock(index, false);
  }

  function handleEnter(index: number, block: PlannerBlock, event: KeyboardEvent) {
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const slashItems = slashMenu?.blockId === block.id ? getSlashItems(slashMenu.query) : [];
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
    event: KeyboardEvent & { currentTarget: HTMLElement }
  ) {
    // ── Formatting shortcuts (paragraph only) ────────────────────────────────
    if (block.type === 'paragraph') {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey) {
        if (event.key === 'b') { event.preventDefault(); applyFmt('bold'); return; }
        if (event.key === 'i') { event.preventDefault(); applyFmt('italic'); return; }
        if (event.key === 'e') { event.preventDefault(); applyCode(); return; }
        if (event.key === 'k') { event.preventDefault(); applyLink(); return; }
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 's') {
        event.preventDefault(); applyFmt('strikeThrough'); return;
      }
    }

    // ── Slash menu navigation ────────────────────────────────────────────────
    const slashItems = slashMenu?.blockId === block.id ? getSlashItems(slashMenu.query) : [];
    if (slashMenu?.blockId === block.id && slashItems.length > 0) {
      if (event.key === 'ArrowDown') { event.preventDefault(); slashMenu = { ...slashMenu, selected: Math.min(slashMenu.selected + 1, slashItems.length - 1) }; return; }
      if (event.key === 'ArrowUp')   { event.preventDefault(); slashMenu = { ...slashMenu, selected: Math.max(slashMenu.selected - 1, 0) }; return; }
      if (event.key === 'Escape')    { event.preventDefault(); slashMenu = null; return; }
    }

    if (event.key === 'Enter')     { handleEnter(index, block, event); return; }
    if (event.key === 'Backspace') { handleBackspace(index, block, event.currentTarget); }
  }

  // ── Input paste for single-line inputs (heading / checklist) ─────────────

  function onInputPaste(index: number, event: ClipboardEvent & { currentTarget: HTMLInputElement }) {
    const plain = event.clipboardData?.getData('text/plain') ?? '';
    const el = event.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end && /^https?:\/\/\S+$/.test(plain.trim())) {
      event.preventDefault();
      const selected = el.value.slice(start, end);
      const newText = el.value.slice(0, start) + `[${selected}](${plain.trim()})` + el.value.slice(end);
      setText(index, newText);
    }
  }

  function labelFor(type: PlannerBlock['type']): string {
    if (type === 'heading') return 'Heading';
    if (type === 'paragraph') return 'Text';
    if (type === 'checklist') return 'Checklist';
    return 'Divider';
  }

  function toggleBlockMenu(blockId: string) {
    blockMenuId = blockMenuId === blockId ? null : blockId;
  }
</script>

<div bind:this={editorElement} class={`space-y-2 ${compact ? '' : 'space-y-3'}`}>
  {#if blockMenuId !== null}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="fixed inset-0 z-10" onclick={() => (blockMenuId = null)}></div>
  {/if}

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
        <!-- Left: add + drag handle -->
        <div class="mt-0.5 flex shrink-0 items-center gap-0.5 text-[var(--text-faint)]">
          <button
            type="button"
            class={`rounded p-1 transition hover:bg-[var(--panel)] hover:text-[var(--text-primary)] ${
              activeBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            aria-label="Add block below"
            onclick={() => insertBlockAt(index, 'paragraph')}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            use:dragHandle
            onclick={() => toggleBlockMenu(block.id)}
            class={`cursor-grab rounded p-1 transition hover:bg-[var(--panel)] hover:text-[var(--text-primary)] active:cursor-grabbing ${
              activeBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            aria-label="Block options"
          >
            <GripVertical size={14} />
          </button>
        </div>

        <!-- Block content -->
        <div class="min-w-0 flex-1">
          {#if block.type === 'heading'}
            <input
              data-block-input={block.id}
              value={block.text}
              oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
              onkeydown={(e) => handleKeydown(index, block, e)}
              onpaste={(e) => onInputPaste(index, e)}
              onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
              onblur={() => { editingBlockId = null; void commit(); }}
              placeholder="Heading"
              class={`w-full border-none bg-transparent p-0 tracking-[-0.03em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] ${compact ? 'text-base font-semibold' : 'text-xl font-semibold'}`}
            />

          {:else if block.type === 'paragraph'}
            <div class="relative">
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                data-block-input={block.id}
                contenteditable="true"
                role="textbox"
                tabindex="0"
                aria-multiline="true"
                aria-label="Paragraph"
                use:htmlContent={block.text}
                oninput={(e) => onParaInput(index, e.currentTarget as HTMLDivElement)}
                onkeydown={(e) => handleKeydown(index, block, e)}
                onpaste={(e) => onParaPaste(e as ClipboardEvent & { currentTarget: HTMLDivElement })}
                onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
                onblur={() => { editingBlockId = null; void commit(); }}
                class="min-h-[1.5rem] w-full cursor-text whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)] outline-none"
              ></div>
              {#if !block.text}
                <span class="pointer-events-none absolute left-0 top-0 text-sm leading-6 text-[var(--text-faint)]">Write a note</span>
              {/if}
            </div>

          {:else if block.type === 'checklist'}
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                checked={block.checked === true}
                onchange={() => toggleChecklist(index)}
                class="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-strong)] bg-transparent text-zinc-900 focus:ring-0 dark:text-zinc-100"
              />
              <input
                data-block-input={block.id}
                value={block.text}
                oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
                onkeydown={(e) => handleKeydown(index, block, e)}
                onpaste={(e) => onInputPaste(index, e)}
                onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
                onblur={() => { editingBlockId = null; void commit(); }}
                placeholder="Checklist item"
                class={`w-full border-none bg-transparent p-0 text-sm outline-none placeholder:text-[var(--text-faint)] ${block.checked ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text-secondary)]'}`}
              />
            </label>

          {:else}
            <!-- Divider -->
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2 text-left"
              onclick={() => (activeBlockId = block.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); insertBlockAt(index, 'paragraph'); }
                else if (e.key === 'Backspace') { e.preventDefault(); removeBlock(index, false); }
              }}
            >
              <span class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Divider</span>
              <span class="h-px flex-1 bg-[var(--border)]"></span>
            </button>
          {/if}

          <!-- Format toolbar — paragraph only, shown while focused -->
          {#if editingBlockId === block.id && block.type === 'paragraph'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              role="toolbar"
              aria-label="Text formatting"
              class="mt-1 flex items-center gap-0.5"
              onmousedown={(e) => e.preventDefault()}
            >
              <button type="button" title="Bold (⌘B)" onclick={() => applyFmt('bold')}
                class="rounded px-1.5 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
                <Bold size={11} />
              </button>
              <button type="button" title="Italic (⌘I)" onclick={() => applyFmt('italic')}
                class="rounded px-1.5 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
                <Italic size={11} />
              </button>
              <button type="button" title="Code (⌘E)" onclick={applyCode}
                class="rounded px-1.5 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
                <Code size={11} />
              </button>
              <button type="button" title="Link (⌘K)" onclick={applyLink}
                class="rounded px-1.5 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
                <Link2 size={11} />
              </button>
              <button type="button" title="Strikethrough (⌘⇧S)" onclick={() => applyFmt('strikeThrough')}
                class="rounded px-1.5 py-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
                <Strikethrough size={11} />
              </button>
            </div>
          {/if}

          <!-- Slash menu -->
          {#if slashMenu?.blockId === block.id}
            {@const slashItems = getSlashItems(slashMenu.query)}
            {#if slashItems.length > 0}
              <div class="mt-2 overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
                <div class="border-b border-[var(--border)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Block type</div>
                <div class="p-1.5">
                  {#each slashItems as type, si (type)}
                    <button
                      type="button"
                      class={`flex w-full items-center gap-2 rounded-[12px] px-3 py-1.5 text-left text-sm transition-colors ${si === slashMenu.selected ? 'bg-[var(--panel-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--panel-soft)]/70'}`}
                      onmousedown={(e) => { e.preventDefault(); replaceBlockType(index, type); }}
                    >
                      {#if type === 'heading'}<Heading1 size={13} />
                      {:else if type === 'paragraph'}<Pilcrow size={13} />
                      {:else if type === 'divider'}<Minus size={13} />
                      {:else}<ListChecks size={13} />{/if}
                      {labelFor(type)}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Context menu (opens on drag-handle click) -->
        {#if blockMenuId === block.id}
          <div class="absolute left-8 top-0 z-20 min-w-[176px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
            <div class="border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Turn into</div>
            <div class="p-1.5">
              {#each availableTypes as type (type)}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-[12px] px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
                  onmousedown={(e) => { e.preventDefault(); replaceBlockType(index, type); blockMenuId = null; }}
                >
                  {#if type === 'heading'}<Heading1 size={13} />
                  {:else if type === 'paragraph'}<Pilcrow size={13} />
                  {:else if type === 'divider'}<Minus size={13} />
                  {:else}<ListChecks size={13} />{/if}
                  {labelFor(type)}
                </button>
              {/each}
            </div>
            <div class="border-t border-[var(--border)] p-1.5">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-[12px] px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
                onmousedown={(e) => { e.preventDefault(); duplicateBlock(index); blockMenuId = null; }}
              >
                <Copy size={13} /> Duplicate
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-[12px] px-3 py-1.5 text-left text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                onmousedown={(e) => { e.preventDefault(); blockMenuId = null; removeBlock(index); }}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if isSaving}
    <p class="px-1.5 pt-1 text-[10px] text-[var(--text-faint)]">Saving…</p>
  {/if}
</div>
