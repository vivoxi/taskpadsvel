<script lang="ts">
  import { FileText, Paperclip, Plus, Search } from 'lucide-svelte';
  import type { NotesDocument } from '$lib/planner/types';

  let {
    documents,
    selectedDocumentId,
    selectedLabel,
    searchQuery,
    attachmentCount,
    categoryPath,
    getPreview,
    relDateShort,
    onSearchInput,
    onCreateDocument,
    onOpenDocument,
    mobile = false
  }: {
    documents: NotesDocument[];
    selectedDocumentId: string;
    selectedLabel: string;
    searchQuery: string;
    attachmentCount: number;
    categoryPath: (categoryId: string | null) => string;
    getPreview: (documentId: string) => string;
    relDateShort: (iso: string) => string;
    onSearchInput: (value: string) => void;
    onCreateDocument: () => void | Promise<void>;
    onOpenDocument?: () => void;
    mobile?: boolean;
  } = $props();
</script>

<section class="{mobile ? 'flex' : 'hidden md:flex'} min-h-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
  <div class="border-b border-[var(--border)] px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-[var(--text-primary)]">{selectedLabel}</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{documents.length} not</p>
      </div>
      <button
        type="button"
        onclick={onCreateDocument}
        class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
        aria-label="Yeni not"
      >
        <Plus size={16} />
      </button>
    </div>

    <div class="mt-4 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <Search size={14} class="text-[var(--text-faint)]" />
      <input
        value={searchQuery}
        oninput={(event) => onSearchInput(event.currentTarget.value)}
        placeholder="Notlarda ara"
        class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
      />
    </div>
  </div>

  <div class="no-scrollbar flex-1 overflow-y-auto px-2 py-2">
    {#each documents as document (document.id)}
      {@const isSelected = document.id === selectedDocumentId}
      <a href={`/notes?doc=${document.id}`} onclick={onOpenDocument} class="block py-0.5 no-underline">
        <article
          class="rounded-md border px-3 py-3 transition-colors {isSelected ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-soft)]'}"
        >
          <div class="flex items-start justify-between gap-3">
            <h2 class="min-w-0 flex-1 truncate text-sm font-semibold leading-snug {isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}">
              {document.title}
            </h2>
            <time class="shrink-0 text-[11px] text-[var(--text-faint)]">{relDateShort(document.updated_at)}</time>
          </div>
          <p class="mt-2 line-clamp-2 min-h-[2.6rem] text-xs leading-relaxed text-[var(--text-muted)]">
            {getPreview(document.id) || ' '}
          </p>
          <div class="mt-3 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
            <span class="truncate">{categoryPath(document.category_id)}</span>
            {#if isSelected && attachmentCount > 0}
              <span class="inline-flex items-center gap-1 text-[var(--accent)]">
                <Paperclip size={11} /> {attachmentCount}
              </span>
            {/if}
          </div>
        </article>
      </a>
    {/each}

    {#if documents.length === 0}
      <div class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        <FileText class="mx-auto mb-3 text-[var(--text-faint)]" size={24} />
        Bu gorunumde not yok.
      </div>
    {/if}
  </div>
</section>
