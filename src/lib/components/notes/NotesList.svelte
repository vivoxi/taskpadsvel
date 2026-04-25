<script lang="ts">
  import {
    ArrowDownAZ,
    Clock3,
    FileText,
    Grid2X2,
    List as ListIcon,
    Paperclip,
    Plus,
    Search,
    Star
  } from 'lucide-svelte';
  import type { NotesDocument } from '$lib/planner/types';

  type ViewMode = 'list' | 'grid';
  type SortMode = 'updated' | 'created' | 'title' | 'manual';

  let {
    documents,
    selectedDocumentId,
    selectedLabel,
    viewMode,
    sortMode,
    categoryPath,
    relDateShort,
    onChangeViewMode,
    onChangeSortMode,
    onCreateDocument,
    onOpenDocument,
    onOpenSearch,
    onToggleStar,
    mobile = false
  }: {
    documents: NotesDocument[];
    selectedDocumentId: string;
    selectedLabel: string;
    viewMode: ViewMode;
    sortMode: SortMode;
    categoryPath: (categoryId: string | null) => string;
    relDateShort: (iso: string) => string;
    onChangeViewMode: (mode: ViewMode) => void;
    onChangeSortMode: (mode: SortMode) => void;
    onCreateDocument: () => void | Promise<void>;
    onOpenDocument?: () => void;
    onOpenSearch: () => void;
    onToggleStar: (document: NotesDocument) => void | Promise<void>;
    mobile?: boolean;
  } = $props();

  const showPinnedGroups = $derived(selectedLabel !== 'Trash' && documents.some((document) => document.starred));
  const groupedDocuments = $derived(
    showPinnedGroups
      ? [
          { label: 'Pinned', docs: documents.filter((document) => document.starred) },
          { label: 'Others', docs: documents.filter((document) => !document.starred) }
        ].filter((group) => group.docs.length > 0)
      : [{ label: '', docs: documents }]
  );
</script>

<section class="{mobile ? 'flex' : 'hidden md:flex'} min-h-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
  <div class="border-b border-[var(--border)] px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-[var(--text-primary)]">{selectedLabel}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{documents.length} not</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={onOpenSearch}
          class="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          aria-label="Notlarda ara"
          title="Search"
        >
          <Search size={15} />
        </button>
        <button
          type="button"
          onclick={onCreateDocument}
          class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
          aria-label="Yeni not"
          title="New note"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>

    <div class="mt-4 flex items-center gap-2">
      <button
        type="button"
        onclick={() => onChangeViewMode('list')}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] transition-colors {viewMode === 'list' ? 'bg-[var(--panel-soft)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}"
        aria-label="Liste gorunumu"
        title="List"
      >
        <ListIcon size={14} />
      </button>
      <button
        type="button"
        onclick={() => onChangeViewMode('grid')}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] transition-colors {viewMode === 'grid' ? 'bg-[var(--panel-soft)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}"
        aria-label="Izgara gorunumu"
        title="Grid"
      >
        <Grid2X2 size={14} />
      </button>

      <label class="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text-muted)]">
        {#if sortMode === 'title'}<ArrowDownAZ size={13} />{:else}<Clock3 size={13} />{/if}
        <select
          value={sortMode}
          onchange={(event) => onChangeSortMode(event.currentTarget.value as SortMode)}
          class="min-w-0 flex-1 border-none bg-transparent text-xs text-[var(--text-secondary)] outline-none"
          aria-label="Notlari sirala"
        >
          <option value="updated">Last modified</option>
          <option value="created">Created date</option>
          <option value="title">Title A-Z</option>
          <option value="manual">Manual</option>
        </select>
      </label>
    </div>
  </div>

  <div class="no-scrollbar flex-1 overflow-y-auto px-2 py-2">
    {#each groupedDocuments as group (group.label)}
      {#if group.label}
        <div class="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {group.label}
        </div>
      {/if}

      <div class={viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1'}>
        {#each group.docs as document (document.id)}
          {@const isSelected = document.id === selectedDocumentId}
          <a href={`/notes?doc=${document.id}`} onclick={onOpenDocument} class="block no-underline">
            <article
              class="group/card relative overflow-hidden rounded-md border transition-colors {isSelected ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-soft)]'} {viewMode === 'grid' ? 'min-h-[158px] p-3' : 'p-3'}"
            >
              <div class={viewMode === 'grid' ? 'space-y-2' : 'flex gap-3'}>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start gap-2">
                    <h2 class="min-w-0 flex-1 truncate text-sm font-semibold leading-snug {isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}">
                      {document.title}
                    </h2>
                    <time class="shrink-0 text-[11px] text-[var(--text-faint)]">{relDateShort(document.updated_at)}</time>
                  </div>

                  {#if document.preview}
                    <p class="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                      {document.preview}
                    </p>
                  {/if}
                </div>

                {#if document.first_image_url}
                  <img
                    src={document.first_image_url}
                    alt=""
                    class="{viewMode === 'grid' ? 'aspect-[4/3] w-full' : 'h-12 w-12 shrink-0'} rounded-md border border-[var(--border)] object-cover"
                    loading="lazy"
                  />
                {/if}
              </div>

              <div class="mt-3 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                <span class="min-w-0 truncate rounded bg-[var(--panel-soft)] px-1.5 py-0.5">{categoryPath(document.category_id)}</span>
                {#if document.attachment_count > 0}
                  <span class="inline-flex items-center gap-1 text-[var(--accent)]">
                    <Paperclip size={11} /> {document.attachment_count}
                  </span>
                {/if}
                {#if document.starred}
                  <Star size={11} class="fill-[var(--accent)] text-[var(--accent)]" />
                {/if}
              </div>

              <button
                type="button"
                onclick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void onToggleStar(document);
                }}
                class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] text-[var(--text-faint)] opacity-0 transition hover:text-[var(--accent)] group-hover/card:opacity-100 focus-visible:opacity-100 {document.starred ? 'opacity-100 text-[var(--accent)]' : ''}"
                aria-label={document.starred ? 'Yildizi kaldir' : 'Yildizla'}
                title={document.starred ? 'Unstar' : 'Star'}
              >
                <Star size={13} class={document.starred ? 'fill-current' : ''} />
              </button>
            </article>
          </a>
        {/each}
      </div>
    {/each}

    {#if documents.length === 0}
      <div class="mx-2 mt-8 rounded-md border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        <FileText class="mx-auto mb-3 text-[var(--text-faint)]" size={24} />
        Bu gorunumde not yok.
      </div>
    {/if}
  </div>
</section>
