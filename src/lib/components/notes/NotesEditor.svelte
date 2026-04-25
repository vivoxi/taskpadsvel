<script lang="ts">
  import { AlertCircle, Check, Folder, Loader2, RotateCcw, Trash2, Upload } from 'lucide-svelte';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import NotesAttachments from '$lib/components/notes/NotesAttachments.svelte';
  import type { NoteCategory, NotesDocument, PlannerBlock, TaskAttachment } from '$lib/planner/types';

  let {
    selectedDoc,
    categories,
    blocks,
    images,
    files,
    uploading,
    uploadProgress,
    categoryPickerOpen,
    saveState,
    saveStatusVisible,
    editorSourceKey,
    wordCount,
    charCount,
    readTime,
    doneCount,
    checklistCount,
    categoryPath,
    relDate,
    relDateShort,
    attachmentHref,
    currentTitle,
    onRenameDocument,
    onSetDocumentCategory,
    onToggleCategoryPicker,
    onCloseCategoryPicker,
    onUploadAttachment,
    onUploadFiles,
    onDeleteAttachment,
    onDeleteDocument,
    onRestoreDocument,
    onDeleteDocumentPermanently,
    onSaveBlocks,
    onUploadInlineImage
  }: {
    selectedDoc: NotesDocument | undefined;
    categories: NoteCategory[];
    blocks: PlannerBlock[];
    images: TaskAttachment[];
    files: TaskAttachment[];
    uploading: boolean;
    uploadProgress: number;
    categoryPickerOpen: boolean;
    saveState: 'saved' | 'saving' | 'error';
    saveStatusVisible?: boolean;
    editorSourceKey: string;
    wordCount: number;
    charCount: number;
    readTime: number;
    doneCount: number;
    checklistCount: number;
    categoryPath: (categoryId: string | null) => string;
    relDate: (iso: string) => string;
    relDateShort: (iso: string) => string;
    attachmentHref: (filePath: string) => string;
    currentTitle: string;
    onRenameDocument: (title: string) => void | Promise<void>;
    onSetDocumentCategory: (categoryId: string | null) => void | Promise<void>;
    onToggleCategoryPicker: () => void;
    onCloseCategoryPicker: () => void;
    onUploadAttachment: (event: Event) => void | Promise<void>;
    onUploadFiles: (files: File[]) => void | Promise<void>;
    onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
    onDeleteDocument: () => void | Promise<void>;
    onRestoreDocument: () => void | Promise<void>;
    onDeleteDocumentPermanently: () => void | Promise<void>;
    onSaveBlocks: (blocks: PlannerBlock[]) => void | Promise<void>;
    onUploadInlineImage: (file: File) => Promise<string>;
  } = $props();

  let titleDraft = $state('');
  let titleInput: HTMLTextAreaElement | null = null;
  let dragActive = $state(false);

  $effect(() => {
    titleDraft = currentTitle;
  });

  function syncTitleHeight() {
    if (!titleInput) return;
    titleInput.style.height = '0px';
    titleInput.style.height = `${titleInput.scrollHeight}px`;
  }

  $effect(() => {
    syncTitleHeight();
  });

  function filesFromDrag(event: DragEvent): File[] {
    return Array.from(event.dataTransfer?.files ?? []);
  }
</script>

<section
  aria-label="Note editor"
  class="group/editor relative flex min-w-0 flex-1 flex-col bg-[var(--bg)]"
  ondragover={(event) => {
    event.preventDefault();
    if (filesFromDrag(event).length > 0) dragActive = true;
  }}
  ondragleave={(event) => {
    if (event.currentTarget === event.target) dragActive = false;
  }}
  ondrop={(event) => {
    event.preventDefault();
    dragActive = false;
    void onUploadFiles(filesFromDrag(event));
  }}
>
  {#if dragActive}
    <div class="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-md border border-dashed border-[var(--accent)] bg-[var(--accent-subtle)] text-sm font-medium text-[var(--accent)]">
      Drop files to attach
    </div>
  {/if}

  <div class="border-b border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 md:hidden">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-[var(--text-primary)]">{currentTitle}</p>
        <p class="mt-0.5 truncate text-xs text-[var(--text-muted)]">{categoryPath(selectedDoc?.category_id ?? null)}</p>
      </div>
      <label class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
        <Upload size={13} />
        {uploading ? `${uploadProgress || 0}%` : 'Ekle'}
        <input type="file" multiple class="hidden" disabled={uploading} onchange={onUploadAttachment} />
      </label>
    </div>
  </div>

  <div class="absolute right-4 top-4 z-20 hidden items-center gap-1 md:flex">
    {#if saveStatusVisible}
      <div class="mr-1 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs shadow-sm">
        {#if saveState === 'saving'}
          <Loader2 size={12} class="text-[var(--accent)]" />
          <span class="text-[var(--accent)]">Kaydediliyor...</span>
        {:else if saveState === 'error'}
          <AlertCircle size={12} class="text-[var(--danger)]" />
          <span class="text-[var(--danger)]">Kayit bekliyor</span>
        {:else}
          <Check size={12} class="text-[var(--accent)]" />
          <span class="text-[var(--text-secondary)]">Kaydedildi</span>
        {/if}
      </div>
    {/if}
    <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] opacity-0 transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] group-hover/editor:opacity-100">
      <Upload size={13} />
      {uploading ? `${uploadProgress || 0}%` : 'Ekle'}
      <input type="file" multiple class="hidden" disabled={uploading} onchange={onUploadAttachment} />
    </label>
    <button
      type="button"
      onclick={onDeleteDocument}
      class="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] text-[var(--text-muted)] opacity-0 transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] group-hover/editor:opacity-100"
      aria-label="Notu sil"
    >
      <Trash2 size={13} />
    </button>
  </div>

  <div class="flex-1 overflow-y-auto">
    <article class="mx-auto max-w-[800px] px-5 pb-24 pt-10 md:px-12 md:pt-16">
      {#if selectedDoc?.deleted_at}
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-secondary)]">
          <span>This note is in Trash.</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick={onRestoreDocument} class="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <RotateCcw size={13} />
              Restore
            </button>
            <button type="button" onclick={onDeleteDocumentPermanently} class="inline-flex items-center gap-1 rounded-md border border-[var(--danger)] px-2.5 py-1.5 text-xs text-[var(--danger)]">
              <Trash2 size={13} />
              Delete forever
            </button>
          </div>
        </div>
      {/if}

      <textarea
        bind:this={titleInput}
        bind:value={titleDraft}
        rows="1"
        spellcheck="false"
        aria-label="Note title"
        oninput={syncTitleHeight}
        onblur={() => onRenameDocument(titleDraft)}
        onkeydown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            titleDraft = currentTitle;
            event.currentTarget.blur();
          }
        }}
        class="mb-3 min-h-[3rem] w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[2.3rem] font-bold leading-tight text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        style="letter-spacing:0;word-break:break-word"
      ></textarea>

      <div class="relative mb-8 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={onToggleCategoryPicker}
          class="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--panel-soft)]"
        >
          <Folder size={12} />
          {categoryPath(selectedDoc?.category_id ?? null)}
        </button>
        {#if selectedDoc}
          <span class="text-xs text-[var(--text-muted)]">{relDate(selectedDoc.updated_at)}</span>
        {/if}

        {#if categoryPickerOpen}
          <button type="button" class="fixed inset-0 z-40" onclick={onCloseCategoryPicker} aria-label="Kapat"></button>
          <div class="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)] py-1 shadow-lg">
            <button
              type="button"
              onclick={() => onSetDocumentCategory(null)}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--panel-soft)] {!selectedDoc?.category_id ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            ><Folder size={12} /> No Folder</button>
            {#each categories as category (category.id)}
              <button
                type="button"
                onclick={() => onSetDocumentCategory(category.id)}
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--panel-soft)] {selectedDoc?.category_id === category.id ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                style={category.parent_id ? 'padding-left: 1.75rem' : ''}
              ><Folder size={12} /> {categoryPath(category.id)}</button>
            {/each}
          </div>
        {/if}
      </div>

      <NotesAttachments
        {images}
        {files}
        {attachmentHref}
        {relDateShort}
        onDeleteAttachment={onDeleteAttachment}
      />

      <div class="notes-editor-surface">
        <BlockEditor
          sourceKey={editorSourceKey}
          {blocks}
          notesMode
          emptyLabel="Yazmaya basla..."
          insertOrder={['heading1', 'heading2', 'heading3', 'paragraph', 'bullet_list', 'numbered_list', 'todo', 'code', 'quote', 'divider', 'image']}
          onCommit={onSaveBlocks}
          onUploadImage={onUploadInlineImage}
        />
      </div>
    </article>
  </div>

  {#if selectedDoc}
    <div class="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--panel-soft)] px-5 py-2 text-[11px] text-[var(--text-muted)] md:px-8">
      {#if saveState === 'saving'}
        <span class="inline-flex items-center gap-1 text-[var(--accent)]"><Loader2 size={12} /> Saving...</span>
      {:else if saveState === 'error'}
        <span class="inline-flex items-center gap-1 text-[var(--danger)]"><AlertCircle size={12} /> Failed to save</span>
      {:else}
        <span class="inline-flex items-center gap-1"><Check size={12} /> Saved</span>
      {/if}
      <span class="text-[var(--text-faint)]">·</span>
      <span>{relDate(selectedDoc.updated_at)}</span>
      {#if wordCount > 0}
        <span class="text-[var(--text-faint)]">·</span>
        <span>{wordCount} kelime</span>
        <span class="text-[var(--text-faint)]">·</span>
        <span>{charCount} karakter</span>
        <span class="text-[var(--text-faint)]">·</span>
        <span>~{readTime} min read</span>
      {/if}
      {#if checklistCount > 0}
        <span class="text-[var(--text-faint)]">·</span>
        <span>{doneCount}/{checklistCount} gorev</span>
      {/if}
      <span class="text-[var(--text-faint)]">·</span>
      <span class="truncate">{categoryPath(selectedDoc.category_id)}</span>
    </div>
  {/if}
</section>
