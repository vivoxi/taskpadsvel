<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ChevronRight, FileText, Paperclip, Pencil, Plus, Trash2, Upload } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import { showConfirm } from '$lib/stores/confirm';
  import type { NoteCategory, PlannerBlock, TaskAttachment } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let uploading = $state(false);

  // ── Categories state ──────────────────────────────────────────────────────
  let selectedCategoryId = $state<string | null>(null);
  let expandedCategories = $state<Set<string>>(new Set());
  let renamingCategoryId = $state<string | null>(null);
  let renameValue = $state('');
  let categoryPickerOpen = $state(false);

  type CategoryNode = NoteCategory & { children: CategoryNode[] };

  const categoryTree = $derived.by<CategoryNode[]>(() => {
    const nodeMap = new Map<string, CategoryNode>();
    for (const c of data.view.categories) nodeMap.set(c.id, { ...c, children: [] });
    const roots: CategoryNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  });

  const selectedDoc = $derived(data.view.documents.find((d) => d.id === data.view.selectedDocumentId));
  const selectedDocCategory = $derived(
    selectedDoc?.category_id ? data.view.categories.find((c) => c.id === selectedDoc.category_id) ?? null : null
  );

  function toggleExpand(id: string) {
    const next = new Set(expandedCategories);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedCategories = next;
  }

  // ── Sidebar pagination ────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let sidebarPage = $state(0);

  const filteredDocs = $derived(
    selectedCategoryId !== null
      ? data.view.documents.filter((d) => d.category_id === selectedCategoryId)
      : data.view.documents
  );
  const totalPages = $derived(Math.ceil(filteredDocs.length / PAGE_SIZE));
  const pagedDocs = $derived(
    filteredDocs.slice(sidebarPage * PAGE_SIZE, (sidebarPage + 1) * PAGE_SIZE)
  );

  $effect(() => { filteredDocs; sidebarPage = 0; });

  // ── Attachment helpers ────────────────────────────────────────────────────
  function attachmentHref(filePath: string) {
    return `/uploads/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`;
  }

  function isImage(attachment: TaskAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
  }

  // ── Document actions ──────────────────────────────────────────────────────
  async function createDocument() {
    try {
      const doc = await apiSendJson<{ id: string }>('/api/notes/documents', 'POST', { title: 'Untitled' });
      await goto(`/notes?doc=${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create note');
    }
  }

  async function renameDocument(title: string) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: title.trim() || 'Untitled'
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename note');
    }
  }

  async function deleteDocument() {
    if (!await showConfirm('This note and all its attachments will be permanently deleted.', 'Delete note?')) return;
    try {
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}`, { method: 'DELETE' });
      await goto('/notes');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete note');
    }
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}/blocks`, 'POST', { blocks });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save note');
    }
  }

  // ── Category actions ──────────────────────────────────────────────────────
  async function createCategory() {
    try {
      const cat = await apiSendJson<NoteCategory>('/api/notes/categories', 'POST', {
        name: 'New Category',
        parent_id: null,
        color: null
      });
      await invalidateAll();
      renamingCategoryId = cat.id;
      renameValue = cat.name;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category');
    }
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    renamingCategoryId = null;
    if (!trimmed) return;
    try {
      await apiSendJson(`/api/notes/categories/${id}`, 'PATCH', { name: trimmed });
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename category');
    }
  }

  async function deleteCategory(id: string) {
    if (!await showConfirm('This category will be removed. Notes in it will become uncategorized.', 'Delete category?')) return;
    try {
      await apiFetch(`/api/notes/categories/${id}`, { method: 'DELETE' });
      if (selectedCategoryId === id) selectedCategoryId = null;
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete category');
    }
  }

  async function setDocumentCategory(categoryId: string | null) {
    categoryPickerOpen = false;
    if (!selectedDoc || categoryId === selectedDoc.category_id) return;
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: selectedDoc.title,
        category_id: categoryId
      });
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update category');
    }
  }

  // ── Attachment actions ────────────────────────────────────────────────────
  async function uploadAttachment(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const form = new FormData();
      form.set('file', file);
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}/attachments`, {
        method: 'POST',
        body: form
      });
      toast.success('File attached');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      input.value = '';
      uploading = false;
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!await showConfirm('This attachment will be permanently removed.', 'Remove attachment?')) return;
    try {
      await apiFetch(
        `/api/notes/documents/${data.view.selectedDocumentId}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );
      toast('Attachment removed');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove attachment');
    }
  }

  async function uploadInlineImage(file: File): Promise<string> {
    const form = new FormData();
    form.set('file', file);
    const res = await apiFetch(
      `/api/notes/documents/${data.view.selectedDocumentId}/attachments`,
      { method: 'POST', body: form }
    );
    const json = await res.json() as { public_url: string };
    return json.public_url;
  }
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto grid max-w-[1440px] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">

    <!-- ── Sidebar ───────────────────────────────────────────────────────── -->
    <aside class="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Notes</h1>
        <button
          type="button"
          onclick={createDocument}
          class="rounded-full p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
          aria-label="New note"
        >
          <Plus size={14} />
        </button>
      </div>

      <!-- ── Category tree ──────────────────────────────────────────────── -->
      <div class="border-b border-[var(--border)] pb-3">
        <!-- All Notes -->
        <button
          type="button"
          onclick={() => (selectedCategoryId = null)}
          class="flex w-full items-center rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--panel-soft)] {selectedCategoryId === null ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
          style={selectedCategoryId === null ? 'box-shadow: inset 2px 0 0 var(--accent)' : ''}
        >
          <span class="flex-1 truncate text-left">All Notes</span>
          <span class="text-[10px] text-[var(--text-faint)]">{data.view.documents.length}</span>
        </button>

        <!-- Top-level categories -->
        {#each categoryTree as cat (cat.id)}
          <div>
            <div class="group flex items-center gap-1 rounded-lg px-1 py-0.5">
              <!-- Expand toggle or spacer -->
              {#if cat.children.length > 0}
                <button
                  type="button"
                  onclick={() => toggleExpand(cat.id)}
                  class="shrink-0 rounded p-0.5 text-[var(--text-faint)] transition-transform hover:text-[var(--text-secondary)] {expandedCategories.has(cat.id) ? 'rotate-90' : ''}"
                  aria-label="Toggle"
                >
                  <ChevronRight size={12} />
                </button>
              {:else}
                <span class="w-5 shrink-0"></span>
              {/if}

              <!-- Name or rename input -->
              {#if renamingCategoryId === cat.id}
                <input
                  class="flex-1 rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.5 text-sm outline-none"
                  bind:value={renameValue}
                  onblur={() => commitRename(cat.id)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') commitRename(cat.id);
                    if (e.key === 'Escape') renamingCategoryId = null;
                  }}
                />
              {:else}
                <button
                  type="button"
                  onclick={() => (selectedCategoryId = cat.id)}
                  class="flex-1 truncate text-left text-sm {selectedCategoryId === cat.id ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                  style={selectedCategoryId === cat.id ? 'box-shadow: inset 2px 0 0 var(--accent)' : ''}
                >{cat.name}</button>
              {/if}

              <!-- Hover actions -->
              <div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onclick={() => { renamingCategoryId = cat.id; renameValue = cat.name; }}
                  class="rounded p-0.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
                  aria-label="Rename"
                ><Pencil size={10} /></button>
                <button
                  type="button"
                  onclick={() => deleteCategory(cat.id)}
                  class="rounded p-0.5 text-[var(--text-faint)] hover:text-red-500"
                  aria-label="Delete"
                ><Trash2 size={10} /></button>
              </div>
            </div>

            <!-- Sub-categories -->
            {#if expandedCategories.has(cat.id) && cat.children.length > 0}
              {#each cat.children as child (child.id)}
                <div class="group ml-5 flex items-center gap-1 rounded-lg px-1 py-0.5">
                  <span class="w-5 shrink-0"></span>
                  {#if renamingCategoryId === child.id}
                    <input
                      class="flex-1 rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.5 text-sm outline-none"
                      bind:value={renameValue}
                      onblur={() => commitRename(child.id)}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') commitRename(child.id);
                        if (e.key === 'Escape') renamingCategoryId = null;
                      }}
                    />
                  {:else}
                    <button
                      type="button"
                      onclick={() => (selectedCategoryId = child.id)}
                      class="flex-1 truncate text-left text-sm {selectedCategoryId === child.id ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                      style={selectedCategoryId === child.id ? 'box-shadow: inset 2px 0 0 var(--accent)' : ''}
                    >{child.name}</button>
                  {/if}
                  <div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      onclick={() => { renamingCategoryId = child.id; renameValue = child.name; }}
                      class="rounded p-0.5 text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
                      aria-label="Rename"
                    ><Pencil size={10} /></button>
                    <button
                      type="button"
                      onclick={() => deleteCategory(child.id)}
                      class="rounded p-0.5 text-[var(--text-faint)] hover:text-red-500"
                      aria-label="Delete"
                    ><Trash2 size={10} /></button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/each}

        <!-- New category -->
        <button
          type="button"
          onclick={createCategory}
          class="mt-1 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <Plus size={10} />
          New Category
        </button>
      </div>

      <!-- ── Document list ───────────────────────────────────────────────── -->
      <div class="flex-1 space-y-1">
        {#each pagedDocs as document (document.id)}
          <a
            href={`/notes?doc=${document.id}`}
            class={`block rounded-[14px] border px-3 py-2 text-sm transition-colors ${
              document.id === data.view.selectedDocumentId
                ? 'border-[var(--border-strong)] bg-[var(--panel-soft)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--panel-soft)]/70'
            }`}
          >
            <div class="truncate font-medium">{document.title}</div>
            <div class="mt-0.5 text-[10px] text-[var(--text-faint)]">
              {new Date(document.updated_at).toLocaleDateString('tr-TR')}
            </div>
          </a>
        {/each}

        {#if filteredDocs.length === 0}
          <p class="px-1 text-sm text-[var(--text-muted)]">
            {selectedCategoryId ? 'No notes in this category.' : 'No notes yet.'}
          </p>
        {/if}
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            disabled={sidebarPage === 0}
            onclick={() => (sidebarPage -= 1)}
            class="rounded-full px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] disabled:opacity-30"
          >← Prev</button>
          <span class="text-[10px] text-[var(--text-faint)]">{sidebarPage + 1} / {totalPages}</span>
          <button
            type="button"
            disabled={sidebarPage >= totalPages - 1}
            onclick={() => (sidebarPage += 1)}
            class="rounded-full px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] disabled:opacity-30"
          >Next →</button>
        </div>
      {/if}
    </aside>

    <!-- ── Main content ──────────────────────────────────────────────────── -->
    <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4 sm:px-5">

      <!-- Header -->
      <div class="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div class="min-w-0 flex-1">
          <input
            value={selectedDoc?.title ?? 'Untitled'}
            onblur={(e) => renameDocument((e.currentTarget as HTMLInputElement).value)}
            class="w-full border-none bg-transparent p-0 text-lg font-medium tracking-[-0.02em] text-[var(--text-primary)] outline-none"
          />

          <!-- Category picker -->
          <div class="relative mt-1.5">
            <button
              type="button"
              onclick={() => (categoryPickerOpen = !categoryPickerOpen)}
              class="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              {selectedDocCategory?.name ?? 'No category'}
            </button>

            {#if categoryPickerOpen}
              <!-- Backdrop -->
              <button
                type="button"
                class="fixed inset-0 z-40"
                onclick={() => (categoryPickerOpen = false)}
                aria-label="Close"
              ></button>

              <div class="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 shadow-lg">
                <button
                  type="button"
                  onclick={() => setDocumentCategory(null)}
                  class="flex w-full items-center px-3 py-1.5 text-sm transition-colors hover:bg-[var(--panel-soft)] {!selectedDoc?.category_id ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                >No category</button>
                {#each data.view.categories as cat (cat.id)}
                  <button
                    type="button"
                    onclick={() => setDocumentCategory(cat.id)}
                    class="flex w-full items-center px-3 py-1.5 text-sm transition-colors hover:bg-[var(--panel-soft)] {selectedDoc?.category_id === cat.id ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                    style={cat.parent_id ? 'padding-left: 1.5rem' : ''}
                  >{cat.name}</button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <button
          type="button"
          onclick={deleteDocument}
          class="mt-1 rounded-full p-2 text-[var(--text-faint)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          aria-label="Delete note"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div class="space-y-5 pt-5">

        <!-- ── Attachments ──────────────────────────────────────────────── -->
        <div>
          <div class="mb-2 flex items-center justify-between gap-3">
            <span class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              Attachments{data.view.attachments.length > 0 ? ` · ${data.view.attachments.length}` : ''}
            </span>
            <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              <Upload size={11} />
              {uploading ? 'Uploading…' : 'Attach'}
              <input type="file" class="hidden" disabled={uploading} onchange={uploadAttachment} />
            </label>
          </div>

          {#if data.view.attachments.length === 0}
            <p class="text-sm text-[var(--text-faint)]">No attachments yet.</p>
          {:else}
            {@const images = data.view.attachments.filter(isImage)}
            {@const files  = data.view.attachments.filter((a) => !isImage(a))}

            {#if images.length > 0}
              <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {#each images as att (att.id)}
                  <div class="group relative overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)]">
                    <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer">
                      <img
                        src={attachmentHref(att.file_path)}
                        alt={att.file_name}
                        class="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                        loading="lazy"
                      />
                    </a>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="absolute right-1.5 top-1.5 hidden rounded-full bg-[var(--panel)]/80 p-1 text-[var(--text-faint)] backdrop-blur-sm transition-colors hover:text-red-500 group-hover:flex"
                      aria-label="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                    <div class="truncate px-2 pb-1.5 pt-1 text-[10px] text-[var(--text-faint)]">{att.file_name}</div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if files.length > 0}
              <div class="space-y-1.5">
                {#each files as att (att.id)}
                  <div class="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
                    <span class="shrink-0 text-[var(--text-faint)]">
                      {#if att.mime_type === 'application/pdf'}
                        <FileText size={14} />
                      {:else}
                        <Paperclip size={14} />
                      {/if}
                    </span>
                    <a
                      href={attachmentHref(att.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      class="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >{att.file_name}</a>
                    <span class="shrink-0 text-[10px] text-[var(--text-faint)]">
                      {new Date(att.created_at).toLocaleDateString('tr-TR')}
                    </span>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="shrink-0 rounded p-1 text-[var(--text-faint)] transition-colors hover:text-red-500"
                      aria-label="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>

        <!-- ── Editor ───────────────────────────────────────────────────── -->
        <BlockEditor
          sourceKey={data.view.selectedDocumentId}
          blocks={data.view.blocks}
          emptyLabel="Start this note with a heading, paragraph, or checklist"
          insertOrder={['heading', 'paragraph', 'checklist', 'divider', 'image']}
          onCommit={saveBlocks}
          onUploadImage={uploadInlineImage}
        />
      </div>
    </section>
  </div>
</div>
