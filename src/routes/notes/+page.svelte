<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Menu, Plus, Search, X } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import NotesCategorySidebar from '$lib/components/notes/NotesCategorySidebar.svelte';
  import NotesEditor from '$lib/components/notes/NotesEditor.svelte';
  import NotesList from '$lib/components/notes/NotesList.svelte';
  import type { CategoryNode } from '$lib/notes/types';
  import { showConfirm } from '$lib/stores/confirm';
  import type { NoteCategory, PlannerBlock, TaskAttachment } from '$lib/planner/types';
  import type { PageData } from './$types';

  type MobilePane = 'editor' | 'notes' | 'categories';

  let { data }: { data: PageData } = $props();

  let uploading = $state(false);
  let searchQuery = $state('');
  let debouncedQuery = $state('');
  let selectedCategoryId = $state<string | null>(null);
  let expandedCategories = $state<Set<string>>(new Set());
  let renamingCategoryId = $state<string | null>(null);
  let renameValue = $state('');
  let categoryPickerOpen = $state(false);
  let mobilePane = $state<MobilePane>('editor');

  $effect(() => {
    const query = searchQuery;
    const timeout = setTimeout(() => {
      debouncedQuery = query;
    }, 150);
    return () => clearTimeout(timeout);
  });

  const categoryTree = $derived.by<CategoryNode[]>(() => {
    const nodeMap = new Map<string, CategoryNode>();
    for (const category of data.view.categories) {
      nodeMap.set(category.id, { ...category, children: [] });
    }

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
        return [node.id, ...node.children.map((child) => child.id)];
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

  const displayedDocs = $derived.by(() => {
    let docs = selectedCategoryIds
      ? data.view.documents.filter((document) => document.category_id && selectedCategoryIds.has(document.category_id))
      : data.view.documents;

    const query = debouncedQuery.trim().toLowerCase();
    if (query) {
      docs = docs.filter((document) => document.title.toLowerCase().includes(query));
    }

    return docs;
  });

  let previewCache = $state<Record<string, string>>({});

  $effect(() => {
    const docId = data.view.selectedDocumentId;
    const first = data.view.blocks.find((block) => block.type !== 'divider' && block.text?.trim());
    if (docId && first?.text) {
      previewCache = {
        ...previewCache,
        [docId]: first.text.replace(/<[^>]+>/g, '').trim().slice(0, 120)
      };
    }
  });

  const selectedDoc = $derived(data.view.documents.find((document) => document.id === data.view.selectedDocumentId));
  const selectedCategory = $derived(
    selectedCategoryId ? data.view.categories.find((category) => category.id === selectedCategoryId) ?? null : null
  );
  const canCreateSubcategory = $derived(selectedCategory !== null && selectedCategory.parent_id === null);
  const checklistBlocks = $derived(data.view.blocks.filter((block) => block.type === 'checklist'));
  const doneCount = $derived(checklistBlocks.filter((block) => block.checked === true).length);
  const wordCount = $derived(
    data.view.blocks
      .filter((block) => block.text)
      .map((block) => block.text.replace(/<[^>]+>/g, '').trim())
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .length
  );
  const attachmentImages = $derived(data.view.attachments.filter(isImage));
  const attachmentFiles = $derived(data.view.attachments.filter((attachment) => !isImage(attachment)));
  const selectedLabel = $derived(selectedCategoryId ? categoryPath(selectedCategoryId) : 'Tum notlar');
  const currentTitle = $derived(selectedDoc?.title ?? 'Untitled');

  function getPreview(documentId: string): string {
    return previewCache[documentId] ?? '';
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
    return data.view.documents.filter((document) => document.category_id && ids.has(document.category_id)).length;
  }

  function nextCategoryName(parentId: string | null): string {
    const base = parentId ? 'Yeni alt kategori' : 'Yeni kategori';
    const siblings = data.view.categories.filter((category) => category.parent_id === parentId);
    const names = new Set(siblings.map((category) => category.name));
    if (!names.has(base)) return base;

    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base} ${index}`;
      if (!names.has(candidate)) return candidate;
    }

    return `${base} ${siblings.length + 1}`;
  }

  function selectOnMount(element: HTMLInputElement) {
    requestAnimationFrame(() => {
      element.focus();
      element.select();
    });
  }

  function titleSync(element: HTMLElement, title: string) {
    element.textContent = title;
    return {
      update(next: string) {
        if (document.activeElement !== element) element.textContent = next;
      }
    };
  }

  function toggleCategory(categoryId: string) {
    const next = new Set(expandedCategories);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    expandedCategories = next;
  }

  function selectCategory(categoryId: string | null) {
    selectedCategoryId = categoryId;
    mobilePane = 'notes';
  }

  function startRename(category: NoteCategory) {
    renamingCategoryId = category.id;
    renameValue = category.name;
  }

  function cancelRename() {
    renamingCategoryId = null;
    renameValue = '';
  }

  function relDateShort(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return 'bugun';
    if (diffDays === 1) return 'dun';
    if (diffDays < 7) return `${diffDays}g`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}h`;
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  function relDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) {
      return `bugun ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) return 'dun';
    if (diffDays < 7) return `${diffDays} gun once`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta once`;
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  function attachmentHref(filePath: string) {
    return `/uploads/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`;
  }

  function isImage(attachment: TaskAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
  }

  async function createDocument() {
    try {
      const document = await apiSendJson<{ id: string }>('/api/notes/documents', 'POST', {
        title: 'Untitled',
        category_id: selectedCategoryId
      });
      mobilePane = 'editor';
      await goto(`/notes?doc=${document.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create note');
    }
  }

  async function renameDocument(title: string) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: title.trim() || 'Untitled'
      });
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename note');
    }
  }

  async function deleteDocument() {
    if (!await showConfirm('This note and all its attachments will be permanently deleted.', 'Delete note?')) return;
    try {
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}`, { method: 'DELETE' });
      await goto('/notes');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete note');
    }
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}/blocks`, 'POST', { blocks });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save note');
    }
  }

  async function createCategory(parentId: string | null = null) {
    try {
      const category = await apiSendJson<NoteCategory>('/api/notes/categories', 'POST', {
        name: nextCategoryName(parentId),
        parent_id: parentId,
        color: null
      });
      if (parentId) {
        const next = new Set(expandedCategories);
        next.add(parentId);
        expandedCategories = next;
      }
      selectedCategoryId = category.id;
      renamingCategoryId = category.id;
      renameValue = category.name;
      mobilePane = 'categories';
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create category');
    }
  }

  async function commitRename(categoryId: string) {
    const trimmed = renameValue.trim();
    renamingCategoryId = null;
    renameValue = '';
    if (!trimmed) return;

    try {
      await apiSendJson(`/api/notes/categories/${categoryId}`, 'PATCH', { name: trimmed });
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename category');
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!await showConfirm('Bu kategori silinecek. Icindeki notlar kategorisiz olacak.', 'Kategori silinsin mi?')) return;
    try {
      await apiFetch(`/api/notes/categories/${categoryId}`, { method: 'DELETE' });
      if (selectedCategoryId === categoryId) selectedCategoryId = null;
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete category');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update category');
    }
  }

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove attachment');
    }
  }

  async function uploadInlineImage(file: File): Promise<string> {
    const form = new FormData();
    form.set('file', file);
    const response = await apiFetch(
      `/api/notes/documents/${data.view.selectedDocumentId}/attachments`,
      { method: 'POST', body: form }
    );
    const payload = await response.json() as { public_url: string };
    return payload.public_url;
  }
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="grid h-full overflow-hidden bg-[var(--bg)] pb-14 text-[var(--text-primary)] md:grid-cols-[230px_330px_minmax(0,1fr)] md:pb-0">
  <NotesCategorySidebar
    categories={data.view.categories}
    {categoryTree}
    {selectedCategoryId}
    {expandedCategories}
    {renamingCategoryId}
    {renameValue}
    {canCreateSubcategory}
    {categoryCount}
    {categoryPath}
    onSelectCategory={selectCategory}
    onToggleCategory={toggleCategory}
    onCreateCategory={createCategory}
    onStartRename={startRename}
    onCommitRename={commitRename}
    onCancelRename={cancelRename}
    onDeleteCategory={deleteCategory}
    onRenameInput={(value) => (renameValue = value)}
    {selectOnMount}
  />

  <NotesList
    documents={displayedDocs}
    selectedDocumentId={data.view.selectedDocumentId}
    {selectedLabel}
    {searchQuery}
    attachmentCount={data.view.attachments.length}
    {categoryPath}
    {getPreview}
    {relDateShort}
    onSearchInput={(value) => (searchQuery = value)}
    onCreateDocument={createDocument}
    onOpenDocument={() => (mobilePane = 'editor')}
  />

  <NotesEditor
    {selectedDoc}
    categories={data.view.categories}
    blocks={data.view.blocks}
    images={attachmentImages}
    files={attachmentFiles}
    {uploading}
    {categoryPickerOpen}
    {wordCount}
    {doneCount}
    checklistCount={checklistBlocks.length}
    {currentTitle}
    {categoryPath}
    {relDate}
    {relDateShort}
    {attachmentHref}
    {titleSync}
    onRenameDocument={renameDocument}
    onSetDocumentCategory={setDocumentCategory}
    onToggleCategoryPicker={() => (categoryPickerOpen = !categoryPickerOpen)}
    onCloseCategoryPicker={() => (categoryPickerOpen = false)}
    onUploadAttachment={uploadAttachment}
    onDeleteAttachment={deleteAttachment}
    onDeleteDocument={deleteDocument}
    onSaveBlocks={saveBlocks}
    onUploadInlineImage={uploadInlineImage}
  />
</div>

<div class="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--panel-soft)] p-2 md:hidden">
  <div class="grid grid-cols-3 gap-2">
    <button
      type="button"
      onclick={() => (mobilePane = mobilePane === 'categories' ? 'notes' : 'categories')}
      class="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs {mobilePane === 'categories' ? 'bg-[var(--panel)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
    >
      {#if mobilePane === 'categories'}<X size={14} />{:else}<Menu size={14} />{/if}
      Kategori
    </button>
    <button
      type="button"
      onclick={() => (mobilePane = mobilePane === 'notes' ? 'editor' : 'notes')}
      class="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs {mobilePane === 'notes' ? 'bg-[var(--panel)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
    >
      {#if mobilePane === 'notes'}<X size={14} />{:else}<Search size={14} />{/if}
      Notlar
    </button>
    <button
      type="button"
      onclick={createDocument}
      class="inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-contrast)]"
    >
      <Plus size={14} />
      Yeni
    </button>
  </div>
</div>

{#if mobilePane === 'categories'}
  <div class="fixed inset-x-0 bottom-14 top-0 z-20 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel-soft)] md:hidden">
    <NotesCategorySidebar
      mobile
      categories={data.view.categories}
      {categoryTree}
      {selectedCategoryId}
      {expandedCategories}
      {renamingCategoryId}
      {renameValue}
      {canCreateSubcategory}
      {categoryCount}
      {categoryPath}
      onSelectCategory={selectCategory}
      onToggleCategory={toggleCategory}
      onCreateCategory={createCategory}
      onStartRename={startRename}
      onCommitRename={commitRename}
      onCancelRename={cancelRename}
      onDeleteCategory={deleteCategory}
      onRenameInput={(value) => (renameValue = value)}
      {selectOnMount}
    />
  </div>
{/if}

{#if mobilePane === 'notes'}
  <div class="fixed inset-x-0 bottom-14 top-0 z-20 overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)] md:hidden">
    <NotesList
      mobile
      documents={displayedDocs}
      selectedDocumentId={data.view.selectedDocumentId}
      {selectedLabel}
      {searchQuery}
      attachmentCount={data.view.attachments.length}
      {categoryPath}
      {getPreview}
      {relDateShort}
      onSearchInput={(value) => (searchQuery = value)}
      onCreateDocument={createDocument}
      onOpenDocument={() => (mobilePane = 'editor')}
    />
  </div>
{/if}
