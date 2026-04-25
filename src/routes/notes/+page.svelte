<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ChevronRight,
    FileText,
    Hash,
    Image as ImageIcon,
    Paperclip,
    Pencil,
    Plus,
    Search,
    Trash2,
    Upload
  } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import { showConfirm } from '$lib/stores/confirm';
  import type { NoteCategory, PlannerBlock, TaskAttachment } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let uploading = $state(false);
  let searchQuery = $state('');
  let debouncedQuery = $state('');

  // ── Debounced search ──────────────────────────────────────────────────────
  $effect(() => {
    const q = searchQuery;
    const t = setTimeout(() => { debouncedQuery = q; }, 150);
    return () => clearTimeout(t);
  });

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

  const categoryById = $derived.by(() => new Map(data.view.categories.map((category) => [category.id, category])));

  function collectCategoryIds(categoryId: string, nodes = categoryTree): string[] {
    for (const node of nodes) {
      if (node.id === categoryId) {
        return [node.id, ...node.children.flatMap((child) => collectCategoryIds(child.id, node.children))];
      }
      const nested = collectCategoryIds(categoryId, node.children);
      if (nested.length > 0) return nested;
    }
    return [];
  }

  const selectedCategoryIds = $derived.by(() => {
    if (!selectedCategoryId) return null;
    return new Set(collectCategoryIds(selectedCategoryId));
  });

  function toggleExpand(id: string) {
    const next = new Set(expandedCategories);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedCategories = next;
  }

  // ── Filtered + searched doc list ──────────────────────────────────────────
  const displayedDocs = $derived.by(() => {
    let docs = selectedCategoryIds !== null
      ? data.view.documents.filter((d) => d.category_id && selectedCategoryIds.has(d.category_id))
      : data.view.documents;
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q));
    }
    return docs;
  });

  // ── Progressive preview cache ─────────────────────────────────────────────
  let previewCache = $state<Record<string, string>>({});

  $effect(() => {
    const docId = data.view.selectedDocumentId;
    if (!docId) return;
    const first = data.view.blocks.find((b) => b.type !== 'divider' && b.text?.trim());
    if (first?.text) {
      const txt = first.text.replace(/<[^>]+>/g, '').trim().slice(0, 120);
      previewCache = { ...previewCache, [docId]: txt };
    }
  });

  function getPreview(docId: string): string {
    return previewCache[docId] ?? '';
  }

  function categoryName(categoryId: string | null): string {
    if (!categoryId) return 'Untagged';
    return categoryById.get(categoryId)?.name ?? 'Untagged';
  }

  function categoryPath(categoryId: string | null): string {
    if (!categoryId) return '#untagged';
    const category = categoryById.get(categoryId);
    if (!category) return '#untagged';
    if (!category.parent_id) return `#${category.name}`;
    const parent = categoryById.get(category.parent_id);
    return parent ? `#${parent.name}/${category.name}` : `#${category.name}`;
  }

  function categoryCount(categoryId: string): number {
    const ids = new Set(collectCategoryIds(categoryId));
    return data.view.documents.filter((doc) => doc.category_id && ids.has(doc.category_id)).length;
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  const selectedDoc = $derived(
    data.view.documents.find((d) => d.id === data.view.selectedDocumentId)
  );
  const selectedDocCategory = $derived(
    selectedDoc?.category_id
      ? data.view.categories.find((c) => c.id === selectedDoc.category_id) ?? null
      : null
  );
  const checklistBlocks = $derived(data.view.blocks.filter((b) => b.type === 'checklist'));
  const doneCount = $derived(checklistBlocks.filter((b) => b.checked === true).length);
  const wordCount = $derived(
    data.view.blocks
      .filter((b) => b.text)
      .map((b) => b.text!.replace(/<[^>]+>/g, '').trim())
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .length
  );
  const attachmentImages = $derived(data.view.attachments.filter(isImage));
  const attachmentFiles = $derived(data.view.attachments.filter((a) => !isImage(a)));

  // ── Title action ──────────────────────────────────────────────────────────
  const currentTitle = $derived(selectedDoc?.title ?? 'Untitled');

  function titleSync(el: HTMLElement, title: string) {
    el.textContent = title;
    return {
      update(next: string) {
        if (document.activeElement !== el) el.textContent = next;
      }
    };
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  function relDateShort(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'bugün';
    if (diffDays === 1) return 'dün';
    if (diffDays < 7) return `${diffDays}g`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}h`;
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  function relDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) {
      const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return `bugün ${hm}`;
    }
    if (diffDays === 1) return 'dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

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
  async function createCategory(parentId: string | null = null) {
    try {
      const cat = await apiSendJson<NoteCategory>('/api/notes/categories', 'POST', {
        name: 'New Category',
        parent_id: parentId,
        color: null
      });
      await invalidateAll();
      if (parentId) {
        const next = new Set(expandedCategories);
        next.add(parentId);
        expandedCategories = next;
      }
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
    if (!await showConfirm('Bu kategori silinecek. İçindeki notlar kategorisiz olacak.', 'Kategori silinsin mi?')) return;
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

<div
  class="grid h-full overflow-hidden text-[#e9dfcf] md:grid-cols-[220px_320px_minmax(0,1fr)]"
  style="background:#151210"
>
  <aside class="hidden min-w-0 border-r border-[#2b241f] bg-[#1a1613] md:flex md:flex-col">
    <div class="flex items-center justify-between px-4 pb-3 pt-4">
      <div>
        <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7f70]">Tags</div>
        <div class="mt-1 text-[12px] text-[#6f6256]">{data.view.categories.length} kategori</div>
      </div>
      <button
        type="button"
        onclick={() => createCategory(null)}
        class="flex h-7 w-7 items-center justify-center rounded-md text-[#9b8a7a] transition-colors hover:bg-[#2a231e] hover:text-[#f0a45d]"
        aria-label="Yeni kategori"
        title="Yeni kategori"
      >
        <Plus size={15} />
      </button>
    </div>

    <div class="border-y border-[#2b241f] px-2 py-2">
      <button
        type="button"
        onclick={() => (selectedCategoryId = null)}
        class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors {selectedCategoryId === null ? 'bg-[#2f251d] text-[#ffe6c7]' : 'text-[#b9aa99] hover:bg-[#241d19] hover:text-[#eadccb]'}"
      >
        <FileText size={14} />
        <span class="min-w-0 flex-1 truncate">All Notes</span>
        <span class="text-[11px] text-[#7c6f62]">{data.view.documents.length}</span>
      </button>
    </div>

    <div class="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
      {#each categoryTree as cat (cat.id)}
        <div class="group/tag">
          <div class="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[#241d19]">
            {#if cat.children.length > 0}
              <button
                type="button"
                onclick={() => toggleExpand(cat.id)}
                class="shrink-0 rounded p-1 text-[#7e7063] transition hover:text-[#d8b58f] {expandedCategories.has(cat.id) ? 'rotate-90' : ''}"
                aria-label="Alt kategorileri aç"
              >
                <ChevronRight size={13} />
              </button>
            {:else}
              <span class="w-[22px] shrink-0"></span>
            {/if}

            {#if renamingCategoryId === cat.id}
              <input
                class="min-w-0 flex-1 rounded-md border border-[#5c4030] bg-[#120f0d] px-2 py-1 text-[13px] text-[#f4e8d8] outline-none"
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
                class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] transition-colors {selectedCategoryId === cat.id ? 'bg-[#3a281c] text-[#ffd8aa]' : 'text-[#b9aa99] hover:text-[#eadccb]'}"
              >
                <Hash size={12} class="shrink-0 text-[#c87837]" />
                <span class="min-w-0 flex-1 truncate">{cat.name}</span>
                <span class="text-[11px] text-[#74675b]">{categoryCount(cat.id)}</span>
              </button>
            {/if}

            <div class="hidden shrink-0 items-center gap-0.5 group-hover/tag:flex">
              <button
                type="button"
                onclick={() => createCategory(cat.id)}
                class="rounded p-1 text-[#76675b] hover:text-[#f0a45d]"
                aria-label="Alt kategori ekle"
                title="Alt kategori ekle"
              ><Plus size={11} /></button>
              <button
                type="button"
                onclick={() => { renamingCategoryId = cat.id; renameValue = cat.name; }}
                class="rounded p-1 text-[#76675b] hover:text-[#d8b58f]"
                aria-label="Yeniden adlandır"
              ><Pencil size={10} /></button>
              <button
                type="button"
                onclick={() => deleteCategory(cat.id)}
                class="rounded p-1 text-[#76675b] hover:text-[#f87171]"
                aria-label="Sil"
              ><Trash2 size={10} /></button>
            </div>
          </div>

          {#if expandedCategories.has(cat.id)}
            <div class="ml-6 border-l border-[#2b241f] pl-2">
              {#each cat.children as child (child.id)}
                <div class="group/subtag flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[#241d19]">
                  {#if renamingCategoryId === child.id}
                    <input
                      class="min-w-0 flex-1 rounded-md border border-[#5c4030] bg-[#120f0d] px-2 py-1 text-[13px] text-[#f4e8d8] outline-none"
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
                      class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12px] transition-colors {selectedCategoryId === child.id ? 'bg-[#3a281c] text-[#ffd8aa]' : 'text-[#a99a8b] hover:text-[#eadccb]'}"
                    >
                      <Hash size={11} class="shrink-0 text-[#af6c39]" />
                      <span class="min-w-0 flex-1 truncate">{child.name}</span>
                      <span class="text-[10px] text-[#74675b]">{categoryCount(child.id)}</span>
                    </button>
                  {/if}

                  <div class="hidden shrink-0 items-center gap-0.5 group-hover/subtag:flex">
                    <button
                      type="button"
                      onclick={() => { renamingCategoryId = child.id; renameValue = child.name; }}
                      class="rounded p-1 text-[#76675b] hover:text-[#d8b58f]"
                      aria-label="Yeniden adlandır"
                    ><Pencil size={10} /></button>
                    <button
                      type="button"
                      onclick={() => deleteCategory(child.id)}
                      class="rounded p-1 text-[#76675b] hover:text-[#f87171]"
                      aria-label="Sil"
                    ><Trash2 size={10} /></button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </aside>

  <section class="hidden min-w-0 border-r border-[#2b241f] bg-[#201a16] md:flex md:flex-col">
    <div class="flex items-center justify-between px-4 pb-3 pt-4">
      <div class="min-w-0">
        <div class="truncate text-[13px] font-semibold text-[#f0dfca]">
          {selectedCategoryId ? categoryPath(selectedCategoryId) : 'All Notes'}
        </div>
        <div class="mt-1 text-[12px] text-[#7f7165]">{displayedDocs.length} not</div>
      </div>
      <button
        type="button"
        onclick={createDocument}
        class="flex h-8 w-8 items-center justify-center rounded-md bg-[#c86f35] text-[#1a120d] transition-colors hover:bg-[#e18a4d]"
        aria-label="Yeni not"
        title="Yeni not"
      >
        <Plus size={16} />
      </button>
    </div>

    <div class="px-3 pb-3">
      <div class="flex items-center gap-2 rounded-md border border-[#342920] bg-[#15110f] px-3 py-2">
        <Search size={13} class="text-[#7d6e61]" />
        <input
          bind:value={searchQuery}
          placeholder="Notlarda ara"
          class="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#f2e4d3] outline-none placeholder:text-[#74675b]"
        />
      </div>
    </div>

    <div class="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
      {#each displayedDocs as doc (doc.id)}
        {@const isSelected = doc.id === data.view.selectedDocumentId}
        <a href={`/notes?doc=${doc.id}`} class="block py-0.5 no-underline">
          <div
            class="rounded-md border px-3 py-3 transition-colors {isSelected ? 'border-[#7a4a2c] bg-[#332217]' : 'border-transparent hover:border-[#332920] hover:bg-[#261f1a]'}"
          >
            <div class="mb-1 flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1 truncate text-[14px] font-semibold leading-snug {isSelected ? 'text-[#ffe7c9]' : 'text-[#dfcfbd]'}">
                {doc.title}
              </div>
              <div class="shrink-0 text-[11px] text-[#796b60]">{relDateShort(doc.updated_at)}</div>
            </div>
            <div class="line-clamp-2 min-h-[34px] text-[12px] leading-[1.45] text-[#9a8c7f]">
              {getPreview(doc.id) || ' '}
            </div>
            <div class="mt-2 flex items-center gap-2 text-[11px] text-[#796b60]">
              <span class="truncate">{categoryPath(doc.category_id)}</span>
              {#if doc.id === data.view.selectedDocumentId && data.view.attachments.length > 0}
                <span class="inline-flex items-center gap-1 text-[#b9855b]">
                  <Paperclip size={11} /> {data.view.attachments.length}
                </span>
              {/if}
            </div>
          </div>
        </a>
      {/each}

      {#if displayedDocs.length === 0}
        <div class="px-4 py-8 text-center text-[13px] text-[#87786b]">
          {debouncedQuery.trim() ? 'Eşleşen not yok.' : selectedCategoryId ? 'Bu kategoride not yok.' : 'Henüz not yok.'}
        </div>
      {/if}
    </div>
  </section>

  <section class="group/editor relative flex min-w-0 flex-1 flex-col bg-[#f3eadc] text-[#2d241e]">
    <details class="border-b border-[#dccbb8] bg-[#fff6e9] md:hidden">
      <summary class="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm" style="list-style:none">
        <span class="min-w-0 flex-1 truncate font-semibold text-[#3a2d24]">{currentTitle}</span>
        <span class="text-[11px] text-[#8a7868]">Notlar</span>
      </summary>
      <div class="max-h-72 overflow-y-auto border-t border-[#e2d1bf] px-3 py-2">
        <div class="mb-2 flex items-center gap-2 rounded-md border border-[#e2d1bf] bg-white/50 px-3 py-2">
          <Search size={13} class="text-[#9a7d65]" />
          <input
            bind:value={searchQuery}
            placeholder="Notlarda ara"
            class="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#3a2d24] outline-none placeholder:text-[#9a7d65]"
          />
        </div>
        {#each displayedDocs as doc (doc.id)}
          <a
            href={`/notes?doc=${doc.id}`}
            class="block rounded-md px-3 py-2 text-sm no-underline transition-colors {doc.id === data.view.selectedDocumentId ? 'bg-[#ead6bd] text-[#2d241e]' : 'text-[#5c4d41] hover:bg-[#f0e1cf]'}"
          >{doc.title}</a>
        {/each}
        <button
          type="button"
          onclick={createDocument}
          class="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#8b5b32] transition-colors hover:bg-[#f0e1cf]"
        >
          <Plus size={13} /> Yeni not
        </button>
      </div>
    </details>

    <div class="absolute right-4 top-4 z-20 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/editor:opacity-100">
      <label
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#d6c2ac] bg-[#fff8ed]/90 px-2.5 py-1.5 text-[12px] text-[#7b6049] shadow-sm transition-colors hover:border-[#c86f35] hover:text-[#9a4f25]"
        title="Dosya veya resim ekle"
      >
        <Upload size={13} />
        {uploading ? 'Yukleniyor' : 'Ekle'}
        <input type="file" class="hidden" disabled={uploading} onchange={uploadAttachment} />
      </label>
      <button
        type="button"
        onclick={deleteDocument}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-[#d6c2ac] bg-[#fff8ed]/90 text-[#9a7d65] shadow-sm transition-colors hover:border-[#df7c7c] hover:text-[#b83232]"
        aria-label="Notu sil"
        title="Notu sil"
      >
        <Trash2 size={13} />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <article class="mx-auto max-w-[780px] px-5 pb-24 pt-12 md:px-12 md:pt-16">
        <div
          contenteditable="true"
          role="textbox"
          tabindex="0"
          aria-label="Note title"
          use:titleSync={currentTitle}
          onblur={(e) => renameDocument((e.currentTarget as HTMLElement).textContent?.trim() ?? '')}
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
            if (e.key === 'Escape') { (e.currentTarget as HTMLElement).blur(); }
          }}
          class="mb-3 w-full bg-transparent text-[#271d17] outline-none"
          style="font-size:38px;font-weight:700;letter-spacing:0;line-height:1.12;word-break:break-word"
        ></div>

        <div class="relative mb-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onclick={() => (categoryPickerOpen = !categoryPickerOpen)}
            class="inline-flex items-center gap-1.5 rounded-md bg-[#ead8c2] px-2.5 py-1 text-[12px] font-medium text-[#7a4a2c] transition-colors hover:bg-[#dfc6aa]"
          >
            <Hash size={12} />
            {selectedDocCategory ? categoryPath(selectedDocCategory.id).slice(1) : 'untagged'}
          </button>
          <span class="text-[12px] text-[#9a8674]">{relDate(selectedDoc?.updated_at ?? new Date().toISOString())}</span>

          {#if categoryPickerOpen}
            <button
              type="button"
              class="fixed inset-0 z-40"
              onclick={() => (categoryPickerOpen = false)}
              aria-label="Kapat"
            ></button>
            <div class="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-[#d8c4ad] bg-[#fff8ed] py-1 shadow-xl">
              <button
                type="button"
                onclick={() => setDocumentCategory(null)}
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#f0e1cf] {!selectedDoc?.category_id ? 'font-semibold text-[#7a4a2c]' : 'text-[#5c4d41]'}"
              ><Hash size={12} /> untagged</button>
              {#each data.view.categories as cat (cat.id)}
                <button
                  type="button"
                  onclick={() => setDocumentCategory(cat.id)}
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#f0e1cf] {selectedDoc?.category_id === cat.id ? 'font-semibold text-[#7a4a2c]' : 'text-[#5c4d41]'}"
                  style={cat.parent_id ? 'padding-left: 1.75rem' : ''}
                ><Hash size={12} /> {categoryPath(cat.id).slice(1)}</button>
              {/each}
            </div>
          {/if}
        </div>

        {#if data.view.attachments.length > 0}
          <section class="mb-9 space-y-4 border-y border-[#dfcab4] py-5">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#9a6a43]">
                <Paperclip size={14} />
                <span>Ekler · {data.view.attachments.length}</span>
              </div>
            </div>

            {#if attachmentImages.length > 0}
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {#each attachmentImages as att (att.id)}
                  <figure class="group/img overflow-hidden rounded-md border border-[#d8c4ad] bg-[#fff8ed] shadow-sm">
                    <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer" class="block">
                      <img
                        src={attachmentHref(att.file_path)}
                        alt={att.file_name}
                        class="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                    <figcaption class="flex items-center gap-2 px-3 py-2 text-[12px] text-[#7e6958]">
                      <ImageIcon size={13} class="shrink-0 text-[#b86f38]" />
                      <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer" class="min-w-0 flex-1 truncate text-[#6c5544] no-underline hover:text-[#9a4f25]">
                        {att.file_name}
                      </a>
                      <button
                        type="button"
                        onclick={() => deleteAttachment(att.id)}
                        class="rounded p-1 text-[#aa9481] opacity-100 transition hover:text-[#b83232] md:opacity-0 md:group-hover/img:opacity-100"
                        aria-label="Resmi kaldır"
                      ><Trash2 size={12} /></button>
                    </figcaption>
                  </figure>
                {/each}
              </div>
            {/if}

            {#if attachmentFiles.length > 0}
              <div class="grid gap-2 sm:grid-cols-2">
                {#each attachmentFiles as att (att.id)}
                  <div class="group/file flex items-center gap-3 rounded-md border border-[#d8c4ad] bg-[#fff8ed] px-3 py-3 shadow-sm">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ead8c2] text-[#9a4f25]">
                      {#if att.mime_type === 'application/pdf'}<FileText size={18} />{:else}<Paperclip size={18} />{/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer" class="block truncate text-[13px] font-semibold text-[#4d3b30] no-underline hover:text-[#9a4f25]">
                        {att.file_name}
                      </a>
                      <div class="mt-0.5 truncate text-[11px] text-[#9a8674]">
                        {att.mime_type ?? 'dosya'} · {relDateShort(att.created_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="rounded p-1 text-[#aa9481] opacity-100 transition hover:text-[#b83232] md:opacity-0 md:group-hover/file:opacity-100"
                      aria-label="Dosyayı kaldır"
                    ><Trash2 size={13} /></button>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/if}

        <div class="notes-bear-editor">
          <BlockEditor
            sourceKey={data.view.selectedDocumentId}
            blocks={data.view.blocks}
            emptyLabel="Yazmaya başla..."
            insertOrder={['heading', 'paragraph', 'checklist', 'divider', 'image']}
            onCommit={saveBlocks}
            onUploadImage={uploadInlineImage}
          />
        </div>
      </article>
    </div>

    {#if selectedDoc}
      <div class="flex shrink-0 items-center gap-2 border-t border-[#dfcab4] bg-[#fff6e9] px-5 py-2 text-[11px] text-[#917967] md:px-8">
        <span>{relDate(selectedDoc.updated_at)}</span>
        {#if wordCount > 0}
          <span class="text-[#c5aa91]">·</span>
          <span>{wordCount} kelime</span>
        {/if}
        {#if checklistBlocks.length > 0}
          <span class="text-[#c5aa91]">·</span>
          <span>{doneCount}/{checklistBlocks.length} görev</span>
        {/if}
        <span class="text-[#c5aa91]">·</span>
        <span class="truncate">{categoryPath(selectedDoc.category_id)}</span>
      </div>
    {/if}
  </section>
</div>

<style>
  .notes-bear-editor {
    --bg: #f3eadc;
    --panel: #fff8ed;
    --panel-soft: #ead8c2;
    --panel-strong: #dfc6aa;
    --border: #dfcab4;
    --border-strong: #caa989;
    --text-primary: #2d241e;
    --text-secondary: #4d3b30;
    --text-muted: #7e6958;
    --text-faint: #aa9481;
    --accent: #c86f35;
    --accent-hover: #9a4f25;
    --accent-subtle: rgba(200, 111, 53, 0.14);
    --danger: #b83232;
    color: #2d241e;
  }

  .notes-bear-editor :global([contenteditable='true']) {
    caret-color: #c86f35;
  }

  .notes-bear-editor :global(a) {
    color: #9a4f25;
  }

  .notes-bear-editor :global(img) {
    border-color: #d8c4ad;
  }
</style>
