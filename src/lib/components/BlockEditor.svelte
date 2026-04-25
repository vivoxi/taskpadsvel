<script lang="ts">
  import { flip } from 'svelte/animate';
  import { onMount, tick } from 'svelte';
  import {
    Bold,
    CheckSquare,
    Code,
    Copy,
    GripVertical,
    Heading1,
    Heading2,
    Heading3,
    ImageIcon,
    Italic,
    Link2,
    List,
    ListOrdered,
    ListChecks,
    Minus,
    Pilcrow,
    Plus,
    Quote,
    Strikethrough,
    Trash2,
    Underline
  } from 'lucide-svelte';
  import {
    dragHandle,
    dragHandleZone,
    type DndEvent
  } from 'svelte-dnd-action';
  import { cloneBlocks, createBlock } from '$lib/planner/blocks';
  import { escapeHtml, toRichTextHtml } from '$lib/planner/rich-text';
  import { showConfirm } from '$lib/stores/confirm';
  import type { PlannerBlock } from '$lib/planner/types';

  let {
    sourceKey,
    blocks,
    compact = false,
    notesMode = false,
    emptyLabel = 'Start writing',
    emptyBlockType = 'paragraph',
    insertOrder = ['heading', 'paragraph', 'checklist', 'divider'],
    onCommit,
    onUploadImage
  }: {
    sourceKey: string;
    blocks: PlannerBlock[];
    compact?: boolean;
    notesMode?: boolean;
    emptyLabel?: string;
    emptyBlockType?: PlannerBlock['type'];
    insertOrder?: PlannerBlock['type'][];
    onCommit?: (blocks: PlannerBlock[]) => void | Promise<void>;
    onUploadImage?: (file: File) => Promise<string>;
  } = $props();

  let localBlocks = $state<PlannerBlock[]>([]);
  let isSaving = $state(false);
  let editorElement = $state<HTMLDivElement | null>(null);
  let imageInputEl = $state<HTMLInputElement | null>(null);
  let activeBlockId = $state<string | null>(null);
  let editingBlockId = $state<string | null>(null);
  let blockMenuId = $state<string | null>(null);
  let floatingToolbar = $state<{ x: number; y: number } | null>(null);
  let pendingImageInsert = $state<{ index: number; mode: 'insert' | 'replace' } | null>(null);
  let slashMenu = $state<{
    blockId: string;
    index: number;
    query: string;
    selected: number;
  } | null>(null);
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  const flipDurationMs = $derived(compact ? 120 : 160);
  const availableTypes = $derived(
    [...new Set(insertOrder)].filter(
      (type): type is PlannerBlock['type'] =>
        type === 'heading' ||
        type === 'heading1' ||
        type === 'heading2' ||
        type === 'heading3' ||
        type === 'paragraph' ||
        type === 'checklist' ||
        type === 'todo' ||
        type === 'bullet_list' ||
        type === 'numbered_list' ||
        type === 'code' ||
        type === 'quote' ||
        type === 'divider' ||
        type === 'file' ||
        (type === 'image' && !!onUploadImage)
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

  /** Return text ready to set as innerHTML.
   *  If it already contains HTML tags it is returned as-is;
   *  otherwise it is treated as legacy markdown and converted. */
  function toHtml(text: string): string {
    return toRichTextHtml(text);
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
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    isSaving = true;
    try { await onCommit(cloneBlocks(next)); } finally { isSaving = false; }
  }

  function scheduleCommit(next = localBlocks) {
    if (!notesMode || !onCommit) return;
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      void commit(next);
    }, 800);
  }

  function isHeading(type: PlannerBlock['type']): boolean {
    return type === 'heading' || type === 'heading1' || type === 'heading2' || type === 'heading3';
  }

  function headingLevel(block: PlannerBlock): number {
    if (block.type === 'heading1') return 1;
    if (block.type === 'heading3') return 3;
    return block.level ?? 2;
  }

  function isTodo(type: PlannerBlock['type']): boolean {
    return type === 'checklist' || type === 'todo';
  }

  function setText(index: number, text: string) {
    const next = cloneBlocks(localBlocks);
    next[index] = { ...next[index], text };
    updateBlock(next);
    scheduleCommit(next);
  }

  function toggleChecklist(index: number) {
    const t = localBlocks[index];
    if (!t || !isTodo(t.type)) return;
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
    if (type === 'image') {
      pendingImageInsert = { index: localBlocks.length - 1, mode: 'insert' };
      imageInputEl?.click();
      return;
    }
    const block = createBlock(type);
    const next = [...cloneBlocks(localBlocks), block];
    updateBlock(next);
    void commit(next);
    void focusBlock(block.id, 'start');
  }

  function insertBlockAt(index: number, type: PlannerBlock['type']) {
    if (type === 'image') {
      pendingImageInsert = { index, mode: 'insert' };
      imageInputEl?.click();
      return;
    }
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
    if (type === 'image') {
      pendingImageInsert = { index, mode: 'replace' };
      slashMenu = null;
      imageInputEl?.click();
      return;
    }
    const next = cloneBlocks(localBlocks);
    next[index] = {
      ...target,
      type,
      text: '',
      checked: isTodo(type) ? false : null,
      level: type === 'heading1' ? 1 : type === 'heading3' ? 3 : isHeading(type) ? 2 : null
    };
    updateBlock(next);
    slashMenu = null;
    void commit(next);
    if (type !== 'divider') void focusBlock(target.id, 'start');
    else activeBlockId = target.id;
  }

  async function handleImageFileSelected(files: FileList | null) {
    if (!files || files.length === 0 || !onUploadImage || !pendingImageInsert) return;
    const file = files[0];
    const { index, mode } = pendingImageInsert;
    pendingImageInsert = null;
    if (imageInputEl) imageInputEl.value = '';

    let url: string;
    try {
      url = await onUploadImage(file);
    } catch {
      return;
    }

    const block: PlannerBlock = { id: crypto.randomUUID(), type: 'image', text: url, checked: null, level: null };
    const next = cloneBlocks(localBlocks);
    if (mode === 'replace') {
      next.splice(index, 1, block);
    } else {
      next.splice(index + 1, 0, block);
    }
    updateBlock(next);
    void commit(next);
    activeBlockId = block.id;
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
    if (isHeading(type) || type === 'divider' || type === 'code' || type === 'quote') return 'paragraph';
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

  function markdownTypeFor(value: string): PlannerBlock['type'] | null {
    const text = value.trim();
    if (text === '#') return 'heading1';
    if (text === '##') return 'heading2';
    if (text === '###') return 'heading3';
    if (text === '-' || text === '*') return 'bullet_list';
    if (text === '1.') return 'numbered_list';
    if (text === '>' ) return 'quote';
    if (text === '[]' || text === '[ ]') return 'todo';
    if (text === '```') return 'code';
    if (text === '---') return 'divider';
    return null;
  }

  function handleKeydown(
    index: number,
    block: PlannerBlock,
    event: KeyboardEvent & { currentTarget: HTMLElement }
  ) {
    if (block.type === 'paragraph' && event.key === ' ') {
      const nextType = markdownTypeFor(event.currentTarget.textContent ?? '');
      if (nextType) {
        event.preventDefault();
        replaceBlockType(index, nextType);
        return;
      }
    }

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
    if (type === 'heading' || type === 'heading2') return 'Heading 2';
    if (type === 'heading1') return 'Heading 1';
    if (type === 'heading3') return 'Heading 3';
    if (type === 'paragraph') return 'Text';
    if (type === 'checklist' || type === 'todo') return 'Todo';
    if (type === 'bullet_list') return 'Bullet list';
    if (type === 'numbered_list') return 'Numbered list';
    if (type === 'code') return 'Code';
    if (type === 'quote') return 'Quote';
    if (type === 'image') return 'Image';
    if (type === 'file') return 'File';
    return 'Divider';
  }

  function shortcutFor(type: PlannerBlock['type']): string {
    if (type === 'heading1') return '#';
    if (type === 'heading2' || type === 'heading') return '##';
    if (type === 'heading3') return '###';
    if (type === 'bullet_list') return '-';
    if (type === 'numbered_list') return '1.';
    if (type === 'todo' || type === 'checklist') return '[]';
    if (type === 'code') return '```';
    if (type === 'quote') return '>';
    if (type === 'divider') return '---';
    return `/${labelFor(type).toLowerCase().split(' ')[0]}`;
  }

  function toggleBlockMenu(blockId: string) {
    blockMenuId = blockMenuId === blockId ? null : blockId;
  }

  function handleSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { floatingToolbar = null; return; }
    const range = sel.getRangeAt(0);
    if (!editorElement?.contains(range.commonAncestorContainer)) { floatingToolbar = null; return; }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) { floatingToolbar = null; return; }
    floatingToolbar = { x: rect.left + rect.width / 2, y: rect.top };
  }

  onMount(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  });
</script>

<div bind:this={editorElement} class={notesMode ? 'space-y-1.5' : `space-y-2 ${compact ? '' : 'space-y-3'}`}>
  {#if blockMenuId !== null}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="fixed inset-0 z-10" onclick={() => (blockMenuId = null)}></div>
  {/if}

  {#if localBlocks.length === 0}
    <button
      type="button"
      class={notesMode
        ? 'w-full rounded-md border border-dashed border-[var(--border)] bg-transparent px-3 py-3 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]'
        : 'w-full rounded-[18px] border border-dashed border-[var(--border-strong)] bg-[var(--panel-soft)] px-4 py-4 text-left text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)]'}
      onclick={() => addBlock(emptyBlockType)}
    >
      {emptyLabel}
    </button>
  {/if}

  <div
    use:dragHandleZone={{ items: localBlocks, flipDurationMs, dragDisabled: localBlocks.length < 2 }}
    onconsider={handleDndReorder}
    onfinalize={finalizeDndReorder}
    class={notesMode ? 'space-y-1.5' : 'space-y-2'}
  >
    {#each localBlocks as block, index (block.id)}
      <div
        animate:flip={{ duration: flipDurationMs }}
        class={`group relative flex items-start gap-2 transition-colors ${
          notesMode
            ? `rounded-md px-0 py-1 ${activeBlockId === block.id ? 'bg-transparent' : 'hover:bg-transparent focus-within:bg-transparent'}`
            : `rounded-[16px] px-1.5 py-1.5 ${activeBlockId === block.id ? 'bg-[var(--panel-soft)] ring-1 ring-[var(--border-strong)]' : 'hover:bg-[var(--panel-soft)]/70 focus-within:bg-[var(--panel-soft)]/70'}`
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
          {#if isHeading(block.type)}
            <input
              data-block-input={block.id}
              value={block.text}
              oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
              onkeydown={(e) => handleKeydown(index, block, e)}
              onpaste={(e) => onInputPaste(index, e)}
              onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
              onblur={() => { editingBlockId = null; void commit(); }}
              placeholder={labelFor(block.type)}
              class={`w-full border-none bg-transparent p-0 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] ${
                notesMode
                  ? headingLevel(block) === 1
                    ? 'text-3xl font-bold leading-tight tracking-normal'
                    : headingLevel(block) === 3
                      ? 'text-xl font-semibold leading-snug tracking-normal'
                      : 'text-2xl font-semibold leading-tight tracking-normal'
                  : compact ? 'text-base font-semibold tracking-[-0.03em]' : 'text-xl font-semibold tracking-[-0.03em]'
              }`}
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
                class={notesMode
                  ? 'min-h-[1.75rem] w-full cursor-text whitespace-pre-wrap break-words text-base leading-7 text-[var(--text-secondary)] outline-none'
                  : 'min-h-[1.5rem] w-full cursor-text whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)] outline-none'}
              ></div>
              {#if !block.text}
                <span class={notesMode
                  ? 'pointer-events-none absolute left-0 top-0 text-base leading-7 text-[var(--text-faint)]'
                  : 'pointer-events-none absolute left-0 top-0 text-sm leading-6 text-[var(--text-faint)]'}>Write a note</span>
              {/if}
            </div>

          {:else if block.type === 'bullet_list' || block.type === 'numbered_list'}
            <label class="flex items-start gap-3">
              <span class="mt-1.5 w-5 shrink-0 text-right text-sm text-[var(--text-faint)]">
                {block.type === 'bullet_list' ? '•' : `${index + 1}.`}
              </span>
              <input
                data-block-input={block.id}
                value={block.text}
                oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
                onkeydown={(e) => handleKeydown(index, block, e)}
                onpaste={(e) => onInputPaste(index, e)}
                onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
                onblur={() => { editingBlockId = null; void commit(); }}
                placeholder="List item"
                class={`w-full border-none bg-transparent p-0 outline-none placeholder:text-[var(--text-faint)] ${notesMode ? 'text-base leading-7' : 'text-sm'} text-[var(--text-secondary)]`}
              />
            </label>

          {:else if block.type === 'quote'}
            <div class="border-l-2 border-[var(--accent)] pl-3">
              <input
                data-block-input={block.id}
                value={block.text}
                oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
                onkeydown={(e) => handleKeydown(index, block, e)}
                onpaste={(e) => onInputPaste(index, e)}
                onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
                onblur={() => { editingBlockId = null; void commit(); }}
                placeholder="Quote"
                class={`w-full border-none bg-transparent p-0 italic outline-none placeholder:text-[var(--text-faint)] ${notesMode ? 'text-base leading-7' : 'text-sm'} text-[var(--text-secondary)]`}
              />
            </div>

          {:else if block.type === 'code'}
            <div class="group/code relative rounded-md border border-[var(--border)] bg-[var(--panel-soft)] p-3">
              <textarea
                data-block-input={block.id}
                value={block.text}
                rows="3"
                spellcheck="false"
                oninput={(e) => { setText(index, e.currentTarget.value); openSlashMenu(index, e.currentTarget.value); }}
                onkeydown={(e) => handleKeydown(index, block, e)}
                onfocus={() => { activeBlockId = block.id; editingBlockId = block.id; }}
                onblur={() => { editingBlockId = null; void commit(); }}
                placeholder="Code"
                class="min-h-20 w-full resize-y border-none bg-transparent p-0 font-mono text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
              ></textarea>
              <button
                type="button"
                onclick={() => navigator.clipboard?.writeText(block.text)}
                class="absolute right-2 top-2 rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] text-[var(--text-muted)] opacity-0 transition hover:text-[var(--text-primary)] group-hover/code:opacity-100"
              >
                Copy
              </button>
            </div>

          {:else if isTodo(block.type)}
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
                class={`w-full border-none bg-transparent p-0 outline-none placeholder:text-[var(--text-faint)] ${notesMode ? 'text-base leading-7' : 'text-sm'} ${block.checked ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text-secondary)]'}`}
              />
            </label>

          {:else if block.type === 'image'}
            <div class="group/img relative">
              {#if block.text}
                <img
                  src={block.text}
                  alt="Inline"
                  class="max-w-full rounded-[12px] border border-[var(--border)]"
                />
                <button
                  type="button"
                  aria-label="Delete image"
                  onclick={() => removeBlock(index, false)}
                  class="absolute right-2 top-2 hidden rounded-lg bg-[var(--panel-strong)] p-1 text-[var(--text-muted)] transition-colors hover:text-red-500 group-hover/img:flex"
                >
                  <Trash2 size={13} />
                </button>
              {:else}
                <button
                  type="button"
                  onclick={() => { pendingImageInsert = { index, mode: 'replace' }; imageInputEl?.click(); }}
                  class="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--border-strong)] px-4 py-6 text-sm text-[var(--text-faint)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)]"
                >
                  <ImageIcon size={16} /> Click to upload image
                </button>
              {/if}
            </div>

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
                      {#if type === 'heading1'}<Heading1 size={13} />
                      {:else if type === 'heading' || type === 'heading2'}<Heading2 size={13} />
                      {:else if type === 'heading3'}<Heading3 size={13} />
                      {:else if type === 'paragraph'}<Pilcrow size={13} />
                      {:else if type === 'bullet_list'}<List size={13} />
                      {:else if type === 'numbered_list'}<ListOrdered size={13} />
                      {:else if type === 'todo' || type === 'checklist'}<CheckSquare size={13} />
                      {:else if type === 'code'}<Code size={13} />
                      {:else if type === 'quote'}<Quote size={13} />
                      {:else if type === 'divider'}<Minus size={13} />
                      {:else if type === 'image'}<ImageIcon size={13} />
                      {:else}<ListChecks size={13} />{/if}
                      <span class="min-w-0 flex-1">{labelFor(type)}</span>
                      <span class="text-[10px] text-[var(--text-faint)]">{shortcutFor(type)}</span>
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
                  {#if type === 'heading1'}<Heading1 size={13} />
                  {:else if type === 'heading' || type === 'heading2'}<Heading2 size={13} />
                  {:else if type === 'heading3'}<Heading3 size={13} />
                  {:else if type === 'paragraph'}<Pilcrow size={13} />
                  {:else if type === 'bullet_list'}<List size={13} />
                  {:else if type === 'numbered_list'}<ListOrdered size={13} />
                  {:else if type === 'todo' || type === 'checklist'}<CheckSquare size={13} />
                  {:else if type === 'code'}<Code size={13} />
                  {:else if type === 'quote'}<Quote size={13} />
                  {:else if type === 'divider'}<Minus size={13} />
                  {:else if type === 'image'}<ImageIcon size={13} />
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

  {#if onUploadImage}
    <input
      bind:this={imageInputEl}
      type="file"
      accept="image/*"
      class="hidden"
      onchange={(e) => handleImageFileSelected((e.currentTarget as HTMLInputElement).files)}
    />
  {/if}

  {#if isSaving}
    <p class="px-1.5 pt-1 text-[10px] text-[var(--text-faint)]">Saving…</p>
  {/if}

  {#if floatingToolbar}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      role="toolbar"
      aria-label="Text formatting"
      style="
        position:fixed;
        left:{floatingToolbar.x}px;
        top:{floatingToolbar.y}px;
        transform:translate(-50%,calc(-100% - 8px));
        z-index:100;
        display:flex;
        align-items:center;
        gap:1px;
        padding:3px;
        background:var(--panel-strong);
        border:1px solid var(--border-strong);
        border-radius:8px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
      "
      onmousedown={(e) => e.preventDefault()}
    >
      <button type="button" title="Bold (⌘B)" onclick={() => applyFmt('bold')}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Bold size={12} />
      </button>
      <button type="button" title="Italic (⌘I)" onclick={() => applyFmt('italic')}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Italic size={12} />
      </button>
      <button type="button" title="Underline (⌘U)" onclick={() => applyFmt('underline')}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Underline size={12} />
      </button>
      <button type="button" title="Strikethrough" onclick={() => applyFmt('strikeThrough')}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Strikethrough size={12} />
      </button>
      <button type="button" title="Inline code" onclick={applyCode}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Code size={12} />
      </button>
      <button type="button" title="Link (⌘K)" onclick={applyLink}
        class="rounded px-1.5 py-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]">
        <Link2 size={12} />
      </button>
    </div>
  {/if}
</div>
