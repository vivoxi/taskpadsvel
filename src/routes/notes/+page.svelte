<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Keyboard, Menu, Plus, Search, X } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import NotesCategorySidebar from '$lib/components/notes/NotesCategorySidebar.svelte';
  import NotesEditor from '$lib/components/notes/NotesEditor.svelte';
  import NotesList from '$lib/components/notes/NotesList.svelte';
  import type { CategoryNode, SmartFolderId } from '$lib/notes/types';
  import {
    hydrateNotesStore,
    notesStore,
    patchNoteInStore,
    removeNoteFromStore,
    selectedNoteId,
    setNoteTags,
    setNoteWorkspace,
    setSelectedNoteOptimistic,
    subscribeToNotesRealtime,
    upsertNoteInStore
  } from '$lib/stores/notes';
  import { showConfirm } from '$lib/stores/confirm';
  import type { NoteCategory, NotesDocument, PlannerBlock, TaskAttachment } from '$lib/planner/types';
  import type { PageData } from './$types';

  type MobilePane = 'editor' | 'notes' | 'categories';
  type ViewMode = 'list' | 'grid';
  type SortMode = 'updated' | 'created' | 'title' | 'manual';
  type SaveState = 'saved' | 'saving' | 'error';

  let { data }: { data: PageData } = $props();

  let uploading = $state(false);
  let searchQuery = $state('');
  let debouncedQuery = $state('');
  let selectedSmartFolder = $state<SmartFolderId>('all');
  let selectedCategoryId = $state<string | null>(null);
  let selectedTagId = $state<string | null>(null);
  let expandedCategories = $state<Set<string>>(new Set());
  let renamingCategoryId = $state<string | null>(null);
  let renameValue = $state('');
  let categoryPickerOpen = $state(false);
  let mobilePane = $state<MobilePane>('editor');
  let viewMode = $state<ViewMode>('list');
  let sortMode = $state<SortMode>('updated');
  let searchModalOpen = $state(false);
  let shortcutsOpen = $state(false);
  let sidebarWidth = $state(230);
  let saveState = $state<SaveState>('saved');
  let saveStatusVisible = $state(false);
  let uploadProgress = $state(0);
  let searchCategoryId = $state('');
  let searchDateRange = $state<'all' | '7' | '30'>('all');
  let searchOnlyStarred = $state(false);
  let searchHasAttachment = $state(false);
  let saveHideTimer: ReturnType<typeof setTimeout> | null = null;
  let workspaceRequestId = 0;
  let workspaceRevision = $state(0);

  $effect(() => {
    const query = searchQuery;
    const timeout = setTimeout(() => {
      debouncedQuery = query;
    }, 150);
    return () => clearTimeout(timeout);
  });

  let lastHydratedViewKey = '';
  let hydratingFromPage = false;
  $effect(() => {
    const viewKey = [
      data.view.selectedDocumentId,
      data.view.documents.length,
      data.view.blocks.length,
      data.view.attachments.length,
      data.view.categories.length,
      data.view.tags?.length ?? 0,
      data.view.noteTags?.length ?? 0
    ].join(':');
    if (viewKey === lastHydratedViewKey) return;
    lastHydratedViewKey = viewKey;
    hydratingFromPage = true;
    hydrateNotesStore(data.view);
    queueMicrotask(() => {
      hydratingFromPage = false;
    });
  });

  onMount(() => {
    hydrateNotesStore(data.view);
    const savedWidth = Number(localStorage.getItem('taskpad:notes:sidebar-width'));
    if (Number.isFinite(savedWidth)) sidebarWidth = Math.min(400, Math.max(180, savedWidth));
    const savedView = localStorage.getItem('taskpad:notes:view-mode');
    if (savedView === 'list' || savedView === 'grid') viewMode = savedView;
    const savedSort = localStorage.getItem('taskpad:notes:sort-mode');
    if (savedSort === 'updated' || savedSort === 'created' || savedSort === 'title' || savedSort === 'manual') {
      sortMode = savedSort;
    }

    const onKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchModalOpen = true;
        return;
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void createDocument();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void toggleSelectedStar();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        void toggleSelectedStar();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        categoryPickerOpen = true;
        return;
      }
      if (mod && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        void deleteDocument();
        return;
      }
      if (event.key === 'Escape') {
        searchModalOpen = false;
        shortcutsOpen = false;
        categoryPickerOpen = false;
        return;
      }
      if (!isEditing && event.key === '?') {
        event.preventDefault();
        shortcutsOpen = true;
      }
    };

    const unsubscribeSelected = selectedNoteId.subscribe((documentId) => {
      if (!documentId || documentId === data.view.selectedDocumentId) return;
      data = { ...data, view: { ...data.view, selectedDocumentId: documentId } };
    });
    const unsubscribeNotes = notesStore.subscribe((state) => {
      if (hydratingFromPage) return;
      data = {
        ...data,
        view: {
          ...data.view,
          selectedDocumentId: state.selectedDocumentId || data.view.selectedDocumentId,
          documents: state.documents,
          tags: state.tags,
          noteTags: state.noteTags
        }
      };
    });
    const unsubscribeRealtime = subscribeToNotesRealtime();
    const onOnline = () => {
      void syncLocalDrafts();
    };

    window.addEventListener('keydown', onKeydown);
    window.addEventListener('online', onOnline);
    void syncLocalDrafts();
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('online', onOnline);
      unsubscribeSelected();
      unsubscribeNotes();
      unsubscribeRealtime();
      if (saveHideTimer) clearTimeout(saveHideTimer);
    };
  });

  $effect(() => {
    if (!browser) return;
    localStorage.setItem('taskpad:notes:sidebar-width', String(sidebarWidth));
    localStorage.setItem('taskpad:notes:view-mode', viewMode);
    localStorage.setItem('taskpad:notes:sort-mode', sortMode);
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

  function patchDocument(documentId: string, patch: Partial<NotesDocument>) {
    patchNoteInStore(documentId, patch);
    data = {
      ...data,
      view: {
        ...data.view,
        documents: data.view.documents.map((document) =>
          document.id === documentId ? { ...document, ...patch } : document
        )
      }
    };
  }

  function removeDocument(documentId: string) {
    removeNoteFromStore(documentId);
    data = {
      ...data,
      view: {
        ...data.view,
        documents: data.view.documents.filter((document) => document.id !== documentId)
      }
    };
  }

  function patchCategory(categoryId: string, patch: Partial<NoteCategory>) {
    data = {
      ...data,
      view: {
        ...data.view,
        categories: data.view.categories.map((category) =>
          category.id === categoryId ? { ...category, ...patch } : category
        )
      }
    };
  }

  function removeCategory(categoryId: string) {
    data = {
      ...data,
      view: {
        ...data.view,
        categories: data.view.categories
          .filter((category) => category.id !== categoryId)
          .map((category) => category.parent_id === categoryId ? { ...category, parent_id: null } : category),
        documents: data.view.documents.map((document) =>
          document.category_id === categoryId ? { ...document, category_id: null } : document
        )
      }
    };
  }

  function setSelectedAttachments(attachments: TaskAttachment[]) {
    setNoteWorkspace(data.view.blocks, attachments);
    data = {
      ...data,
      view: {
        ...data.view,
        attachments
      }
    };
  }

  function isDeleted(document: NotesDocument): boolean {
    return Boolean(document.deleted_at);
  }

  function isRecent(document: NotesDocument): boolean {
    return Date.now() - new Date(document.updated_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }

  function sortDocuments(documents: NotesDocument[]): NotesDocument[] {
    return [...documents].sort((left, right) => {
      if (left.starred !== right.starred && selectedSmartFolder !== 'trash') return left.starred ? -1 : 1;
      if (sortMode === 'title') return left.title.localeCompare(right.title, 'tr');
      if (sortMode === 'created') return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      if (sortMode === 'manual') {
        return left.sort_order - right.sort_order || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }

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

  const tagNoteIds = $derived.by(() => {
    if (!selectedTagId) return null;
    return new Set(data.view.noteTags.filter((link) => link.tag_id === selectedTagId).map((link) => link.note_id));
  });

  const displayedDocs = $derived.by(() => {
    let docs = data.view.documents;

    if (tagNoteIds) {
      docs = docs.filter((document) => !isDeleted(document) && tagNoteIds.has(document.id));
    } else if (selectedCategoryIds) {
      docs = docs.filter((document) => !isDeleted(document) && document.category_id && selectedCategoryIds.has(document.category_id));
    } else if (selectedSmartFolder === 'starred') {
      docs = docs.filter((document) => !isDeleted(document) && document.starred);
    } else if (selectedSmartFolder === 'recent') {
      docs = docs.filter((document) => !isDeleted(document) && isRecent(document));
    } else if (selectedSmartFolder === 'trash') {
      docs = docs.filter(isDeleted);
    } else {
      docs = docs.filter((document) => !isDeleted(document));
    }

    return sortDocuments(docs);
  });

  const smartFolders = $derived.by(() => [
    { id: 'all' as const, label: 'All Notes', count: data.view.documents.filter((document) => !isDeleted(document)).length },
    { id: 'starred' as const, label: 'Starred', count: data.view.documents.filter((document) => !isDeleted(document) && document.starred).length },
    { id: 'recent' as const, label: 'Recent', count: data.view.documents.filter((document) => !isDeleted(document) && isRecent(document)).length },
    { id: 'trash' as const, label: 'Trash', count: data.view.documents.filter(isDeleted).length }
  ]);

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
  const checklistBlocks = $derived(data.view.blocks.filter((block) => block.type === 'checklist' || block.type === 'todo'));
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
  const charCount = $derived(
    data.view.blocks
      .map((block) => block.text.replace(/<[^>]+>/g, '').trim())
      .join('\n')
      .length
  );
  const readTime = $derived(Math.max(1, Math.ceil(wordCount / 220)));
  const attachmentImages = $derived(data.view.attachments.filter(isImage));
  const attachmentFiles = $derived(data.view.attachments.filter((attachment) => !isImage(attachment)));
  const selectedLabel = $derived(
    selectedTagId
      ? `#${data.view.tags.find((tag) => tag.id === selectedTagId)?.name ?? 'tag'}`
      : selectedCategoryId
      ? categoryPath(selectedCategoryId)
      : smartFolders.find((folder) => folder.id === selectedSmartFolder)?.label ?? 'All Notes'
  );
  const currentTitle = $derived(selectedDoc?.title ?? 'Untitled');
  const searchResults = $derived.by(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return [];

    return sortDocuments(data.view.documents)
      .filter((document) => !isDeleted(document))
      .filter((document) => {
        if (searchCategoryId && document.category_id !== searchCategoryId) return false;
        if (searchOnlyStarred && !document.starred) return false;
        if (searchHasAttachment && document.attachment_count === 0) return false;
        if (searchDateRange !== 'all') {
          const days = searchDateRange === '7' ? 7 : 30;
          if (Date.now() - new Date(document.updated_at).getTime() > days * 24 * 60 * 60 * 1000) return false;
        }
        const haystack = `${document.title} ${document.preview}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 30);
  });

  function getPreview(documentId: string): string {
    return data.view.documents.find((document) => document.id === documentId)?.preview ?? previewCache[documentId] ?? '';
  }

  function escapeSnippet(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightedSnippet(document: NotesDocument): string {
    const query = debouncedQuery.trim();
    const source = document.preview || document.title;
    if (!query) return escapeSnippet(source);
    const lower = source.toLowerCase();
    const index = lower.indexOf(query.toLowerCase());
    const start = Math.max(0, index - 42);
    const snippet = index >= 0 ? source.slice(start, index + query.length + 70) : source.slice(0, 120);
    const escaped = escapeSnippet(`${start > 0 ? '...' : ''}${snippet}`);
    return escaped.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<strong>$1</strong>');
  }

  function categoryPath(categoryId: string | null): string {
    if (!categoryId) return 'No Folder';

    const category = categoryById.get(categoryId);
    if (!category) return 'No Folder';
    if (!category.parent_id) return category.name;

    const parent = categoryById.get(category.parent_id);
    return parent ? `${parent.name} / ${category.name}` : category.name;
  }

  function categoryCount(categoryId: string): number {
    const ids = new Set(collectCategoryIds(categoryId));
    return data.view.documents.filter((document) => !isDeleted(document) && document.category_id && ids.has(document.category_id)).length;
  }

  function tagCount(tagId: string): number {
    const ids = new Set(data.view.noteTags.filter((link) => link.tag_id === tagId).map((link) => link.note_id));
    return data.view.documents.filter((document) => !isDeleted(document) && ids.has(document.id)).length;
  }

  function plainBlockText(blocks: PlannerBlock[]): string {
    return blocks
      .map((block) => block.text.replace(/<[^>]+>/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nextCategoryName(parentId: string | null): string {
    const base = parentId ? 'New Subfolder' : 'New Folder';
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

  function toggleCategory(categoryId: string) {
    const next = new Set(expandedCategories);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    expandedCategories = next;
  }

  function selectSmartFolder(folderId: SmartFolderId) {
    selectedSmartFolder = folderId;
    selectedCategoryId = null;
    selectedTagId = null;
    mobilePane = 'notes';
  }

  function selectCategory(categoryId: string | null) {
    selectedCategoryId = categoryId;
    selectedTagId = null;
    selectedSmartFolder = 'all';
    mobilePane = 'notes';
  }

  function selectTag(tagId: string) {
    selectedTagId = tagId;
    selectedCategoryId = null;
    selectedSmartFolder = 'all';
    mobilePane = 'notes';
  }

  function startSidebarResize(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent: PointerEvent) => {
      sidebarWidth = Math.min(400, Math.max(180, startWidth + moveEvent.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    return `/uploads/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`;
  }

  function isImage(attachment: TaskAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
  }

  function toClientDocument(row: Partial<NotesDocument> & { id: string }): NotesDocument {
    const categoryId = row.category_id ?? row.folder_id ?? null;
    const starred = row.starred === true || row.is_starred === true;
    return {
      id: row.id,
      title: row.title ?? 'Untitled',
      slug: row.slug ?? null,
      kind: row.kind ?? 'note',
      category_id: categoryId,
      folder_id: categoryId,
      starred,
      is_starred: starred,
      deleted_at: row.deleted_at ?? null,
      color: row.color ?? null,
      sort_order: row.sort_order ?? 0,
      cover_image_url: row.cover_image_url ?? null,
      word_count: row.word_count ?? 0,
      preview: row.preview ?? '',
      attachment_count: row.attachment_count ?? 0,
      first_image_url: row.first_image_url ?? null,
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.updated_at ?? new Date().toISOString()
    };
  }

  async function loadDocumentWorkspace(documentId: string) {
    const requestId = ++workspaceRequestId;
    const response = await apiFetch(`/api/notes/documents/${documentId}/workspace`);
    const payload = await response.json() as { blocks: PlannerBlock[]; attachments: TaskAttachment[] };
    if (requestId !== workspaceRequestId || data.view.selectedDocumentId !== documentId) return;
    data = {
      ...data,
      view: {
        ...data.view,
        blocks: payload.blocks,
        attachments: payload.attachments
      }
    };
    workspaceRevision += 1;
    setNoteWorkspace(payload.blocks, payload.attachments);
  }

  async function openDocument(document: NotesDocument, event?: MouseEvent) {
    event?.preventDefault();
    if (document.id === data.view.selectedDocumentId) {
      mobilePane = 'editor';
      return;
    }
    setSelectedNoteOptimistic(document.id);
    data = {
      ...data,
      view: {
        ...data.view,
        selectedDocumentId: document.id,
        blocks: [],
        attachments: []
      }
    };
    mobilePane = 'editor';
    if (browser) window.history.pushState({}, '', `/notes?doc=${document.id}`);
    try {
      await loadDocumentWorkspace(document.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open note');
    }
  }

  async function createDocument() {
    try {
      const created = await apiSendJson<Partial<NotesDocument> & { id: string }>('/api/notes/documents', 'POST', {
        title: 'Untitled',
        category_id: selectedCategoryId
      });
      const document = toClientDocument({
        ...created,
        category_id: selectedCategoryId,
        created_at: created.created_at ?? new Date().toISOString(),
        updated_at: created.updated_at ?? new Date().toISOString()
      });
      data = {
        ...data,
        view: {
          ...data.view,
          documents: [document, ...data.view.documents],
          selectedDocumentId: document.id,
          blocks: [],
          attachments: []
        }
      };
      upsertNoteInStore(document);
      setSelectedNoteOptimistic(document.id);
      mobilePane = 'editor';
      if (browser) window.history.pushState({}, '', `/notes?doc=${document.id}`);
      await loadDocumentWorkspace(document.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create note');
    }
  }

  async function renameDocument(title: string) {
    if (!selectedDoc) return;
    const nextTitle = title.trim() || 'Untitled';
    const previousTitle = selectedDoc.title;
    patchDocument(selectedDoc.id, { title: nextTitle });
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: nextTitle
      });
    } catch (error) {
      patchDocument(selectedDoc.id, { title: previousTitle });
      toast.error(error instanceof Error ? error.message : 'Failed to rename note');
    }
  }

  async function deleteDocument(document = selectedDoc) {
    if (!document) return;
    if (!await showConfirm('This note will move to Trash. You can restore it later.', 'Delete note?')) return;
    const deletedAt = new Date().toISOString();
    const documentId = document.id;
    const previousDeletedAt = document.deleted_at;
    patchDocument(documentId, { deleted_at: deletedAt });
    if (documentId === data.view.selectedDocumentId) {
      selectedSmartFolder = 'trash';
      selectedCategoryId = null;
      selectedTagId = null;
      mobilePane = 'notes';
    }
    try {
      await apiFetch(`/api/notes/documents/${documentId}`, { method: 'DELETE' });
      toast.success('Moved to Trash');
    } catch (error) {
      patchDocument(documentId, { deleted_at: previousDeletedAt });
      toast.error(error instanceof Error ? error.message : 'Failed to delete note');
    }
  }

  async function restoreDocument() {
    if (!selectedDoc) return;
    const documentId = selectedDoc.id;
    const previousDeletedAt = selectedDoc.deleted_at;
    patchDocument(documentId, { deleted_at: null });
    selectedSmartFolder = 'all';
    try {
      await apiSendJson(`/api/notes/documents/${documentId}`, 'PATCH', { deleted_at: null });
      toast.success('Note restored');
    } catch (error) {
      patchDocument(documentId, { deleted_at: previousDeletedAt });
      toast.error(error instanceof Error ? error.message : 'Failed to restore note');
    }
  }

  async function deleteDocumentPermanently() {
    if (!selectedDoc) return;
    if (!await showConfirm('This permanently deletes the note and attachments.', 'Delete forever?')) return;
    const previousDocuments = data.view.documents;
    removeDocument(selectedDoc.id);
    try {
      await apiFetch(`/api/notes/documents/${selectedDoc.id}?permanent=1`, { method: 'DELETE' });
      await goto('/notes');
    } catch (error) {
      data = { ...data, view: { ...data.view, documents: previousDocuments } };
      toast.error(error instanceof Error ? error.message : 'Failed to delete note');
    }
  }

  async function toggleStar(document: NotesDocument) {
    patchDocument(document.id, { starred: !document.starred, is_starred: !document.starred });
    try {
      await apiSendJson(`/api/notes/documents/${document.id}`, 'PATCH', { is_starred: !document.starred });
    } catch (error) {
      patchDocument(document.id, { starred: document.starred, is_starred: document.starred });
      toast.error(error instanceof Error ? error.message : 'Failed to update star');
    }
  }

  async function toggleSelectedStar() {
    if (!selectedDoc) return;
    await toggleStar(selectedDoc);
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    const documentId = data.view.selectedDocumentId;
    const text = plainBlockText(blocks);
    const nextWordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    data = {
      ...data,
      view: {
        ...data.view,
        blocks,
        documents: data.view.documents.map((document) =>
          document.id === documentId
            ? {
                ...document,
                preview: text.slice(0, 180),
                word_count: nextWordCount,
                updated_at: new Date().toISOString()
              }
            : document
        )
      }
    };
    setNoteWorkspace(blocks, data.view.attachments);
    saveState = 'saving';
    saveStatusVisible = true;
    if (saveHideTimer) clearTimeout(saveHideTimer);
    if (browser && !navigator.onLine) {
      localStorage.setItem(`taskpad:notes:draft:${documentId}`, JSON.stringify({ blocks, savedAt: new Date().toISOString() }));
      saveState = 'error';
      return;
    }

    try {
      const response = await apiSendJson<{ tags?: typeof data.view.tags; noteTags?: typeof data.view.noteTags }>(
        `/api/notes/documents/${documentId}/blocks`,
        'POST',
        { blocks }
      );
      if (response.tags && response.noteTags) {
        setNoteTags(response.tags, response.noteTags, documentId);
        data = {
          ...data,
          view: {
            ...data.view,
            tags: response.tags,
            noteTags: [
              ...data.view.noteTags.filter((link) => link.note_id !== documentId),
              ...response.noteTags
            ]
          }
        };
      }
      if (browser) localStorage.removeItem(`taskpad:notes:draft:${documentId}`);
      saveState = 'saved';
      saveHideTimer = setTimeout(() => {
        saveStatusVisible = false;
      }, 2000);
    } catch (error) {
      if (browser) {
        localStorage.setItem(`taskpad:notes:draft:${documentId}`, JSON.stringify({ blocks, savedAt: new Date().toISOString() }));
      }
      saveState = 'error';
      toast.error(error instanceof Error ? error.message : 'Failed to save note');
    }
  }

  async function syncLocalDrafts() {
    if (!browser || !navigator.onLine) return;
    const draftKeys = Object.keys(localStorage).filter((key) => key.startsWith('taskpad:notes:draft:'));
    for (const key of draftKeys) {
      const documentId = key.replace('taskpad:notes:draft:', '');
      const draft = JSON.parse(localStorage.getItem(key) ?? 'null') as { blocks?: PlannerBlock[] } | null;
      if (!draft?.blocks) continue;
      try {
        await apiSendJson(`/api/notes/documents/${documentId}/blocks`, 'POST', { blocks: draft.blocks });
        localStorage.removeItem(key);
      } catch {
        // Keep the draft for the next online event.
      }
    }
  }

  async function createCategory(parentId: string | null = null) {
    try {
      const category = await apiSendJson<NoteCategory>('/api/notes/categories', 'POST', {
        name: nextCategoryName(parentId),
        parent_id: parentId,
        color: '#6366f1'
      });
      data = {
        ...data,
        view: {
          ...data.view,
          categories: [...data.view.categories, category]
        }
      };
      if (parentId) {
        const next = new Set(expandedCategories);
        next.add(parentId);
        expandedCategories = next;
      }
      selectedCategoryId = category.id;
      renamingCategoryId = category.id;
      renameValue = category.name;
      mobilePane = 'categories';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create folder');
    }
  }

  async function commitRename(categoryId: string) {
    const trimmed = renameValue.trim();
    const previous = data.view.categories.find((category) => category.id === categoryId)?.name ?? '';
    renamingCategoryId = null;
    renameValue = '';
    if (!trimmed) return;

    patchCategory(categoryId, { name: trimmed });
    try {
      await apiSendJson(`/api/notes/categories/${categoryId}`, 'PATCH', { name: trimmed });
    } catch (error) {
      patchCategory(categoryId, { name: previous });
      toast.error(error instanceof Error ? error.message : 'Failed to rename folder');
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!await showConfirm('This folder will be deleted. Notes inside it will move to No Folder.', 'Delete folder?')) return;
    const previousCategories = data.view.categories;
    const previousDocuments = data.view.documents;
    removeCategory(categoryId);
    try {
      await apiFetch(`/api/notes/categories/${categoryId}`, { method: 'DELETE' });
      if (selectedCategoryId === categoryId) selectedCategoryId = null;
    } catch (error) {
      data = { ...data, view: { ...data.view, categories: previousCategories, documents: previousDocuments } };
      toast.error(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  }

  async function updateCategoryColor(categoryId: string, color: string) {
    const previous = data.view.categories.find((category) => category.id === categoryId)?.color ?? null;
    patchCategory(categoryId, { color });
    try {
      await apiSendJson(`/api/notes/categories/${categoryId}`, 'PATCH', { color });
    } catch (error) {
      patchCategory(categoryId, { color: previous });
      toast.error(error instanceof Error ? error.message : 'Failed to update folder color');
    }
  }

  async function moveDocumentToCategory(document: NotesDocument, categoryId: string | null) {
    if (categoryId === document.category_id) return;
    const documentId = document.id;
    const previousCategoryId = document.category_id;
    patchDocument(documentId, { category_id: categoryId, folder_id: categoryId });
    try {
      await apiSendJson(`/api/notes/documents/${documentId}`, 'PATCH', {
        folder_id: categoryId
      });
    } catch (error) {
      patchDocument(documentId, { category_id: previousCategoryId, folder_id: previousCategoryId });
      toast.error(error instanceof Error ? error.message : 'Failed to move note');
    }
  }

  async function moveDocumentIdToCategory(documentId: string, categoryId: string | null) {
    const document = data.view.documents.find((entry) => entry.id === documentId);
    if (document) await moveDocumentToCategory(document, categoryId);
  }

  async function setDocumentCategory(categoryId: string | null) {
    categoryPickerOpen = false;
    if (!selectedDoc) return;
    await moveDocumentToCategory(selectedDoc, categoryId);
  }

  async function updateDocumentColor(document: NotesDocument, color: string | null) {
    const previous = document.color;
    patchDocument(document.id, { color });
    try {
      await apiSendJson(`/api/notes/documents/${document.id}`, 'PATCH', { color });
    } catch (error) {
      patchDocument(document.id, { color: previous });
      toast.error(error instanceof Error ? error.message : 'Failed to update note color');
    }
  }

  async function duplicateDocument(document: NotesDocument) {
    try {
      const duplicate = await apiSendJson<Partial<NotesDocument> & { id: string }>(
        `/api/notes/documents/${document.id}/duplicate`,
        'POST',
        {}
      );
      const nextDocument = toClientDocument(duplicate);
      data = {
        ...data,
        view: {
          ...data.view,
          documents: [nextDocument, ...data.view.documents]
        }
      };
      upsertNoteInStore(nextDocument);
      await openDocument(nextDocument);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate note');
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !selectedDoc) return;
    uploading = true;
    uploadProgress = 0;
    const uploaded: TaskAttachment[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const form = new FormData();
        form.set('file', file);
        const response = await apiFetch(`/api/notes/documents/${selectedDoc.id}/attachments`, {
          method: 'POST',
          body: form
        });
        uploaded.push(await response.json() as TaskAttachment);
        uploadProgress = Math.round(((index + 1) / files.length) * 100);
      }
      setSelectedAttachments([...uploaded, ...data.view.attachments]);
      patchDocument(selectedDoc.id, {
        attachment_count: (selectedDoc.attachment_count ?? 0) + uploaded.length,
        first_image_url:
          selectedDoc.first_image_url ??
          uploaded.find((attachment) => isImage(attachment))?.public_url ??
          (uploaded.find((attachment) => isImage(attachment))?.file_path
            ? attachmentHref(uploaded.find((attachment) => isImage(attachment))!.file_path)
            : null) ??
          null
      });
      toast.success(files.length === 1 ? 'File attached' : `${files.length} files attached`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      uploading = false;
      uploadProgress = 0;
    }
  }

  async function uploadAttachment(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    await uploadFiles(files);
    input.value = '';
  }

  async function deleteAttachment(attachmentId: string) {
    if (!await showConfirm('This attachment will be permanently removed.', 'Remove attachment?')) return;
    const previousAttachments = data.view.attachments;
    const removed = previousAttachments.find((attachment) => attachment.id === attachmentId);
    setSelectedAttachments(previousAttachments.filter((attachment) => attachment.id !== attachmentId));
    if (selectedDoc) {
      patchDocument(selectedDoc.id, {
        attachment_count: Math.max(0, (selectedDoc.attachment_count ?? previousAttachments.length) - 1),
        first_image_url: removed && isImage(removed) ? null : selectedDoc.first_image_url
      });
    }
    try {
      await apiFetch(
        `/api/notes/documents/${data.view.selectedDocumentId}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );
      toast('Attachment removed');
    } catch (error) {
      setSelectedAttachments(previousAttachments);
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

<div
  class="grid h-full overflow-hidden bg-[var(--bg)] pb-14 text-[var(--text-primary)] md:grid-cols-[var(--notes-sidebar-width)_330px_minmax(0,1fr)] md:pb-0"
  style={`--notes-sidebar-width:${sidebarWidth}px`}
>
  <NotesCategorySidebar
    categories={data.view.categories}
    {categoryTree}
    {selectedCategoryId}
    activeSmartFolder={selectedSmartFolder}
    {smartFolders}
    tags={data.view.tags}
    activeTagId={selectedTagId}
    {sidebarWidth}
    {expandedCategories}
    {renamingCategoryId}
    {renameValue}
    {canCreateSubcategory}
    {categoryCount}
    {categoryPath}
    {tagCount}
    onSelectSmartFolder={selectSmartFolder}
    onSelectCategory={selectCategory}
    onSelectTag={selectTag}
    onMoveDocumentToCategory={moveDocumentIdToCategory}
    onToggleCategory={toggleCategory}
    onCreateCategory={createCategory}
    onStartRename={startRename}
    onCommitRename={commitRename}
    onCancelRename={cancelRename}
    onDeleteCategory={deleteCategory}
    onRenameInput={(value) => (renameValue = value)}
    onUpdateCategoryColor={updateCategoryColor}
    onStartSidebarResize={startSidebarResize}
    {selectOnMount}
  />

  <NotesList
    documents={displayedDocs}
    selectedDocumentId={data.view.selectedDocumentId}
    {selectedLabel}
    {viewMode}
    {sortMode}
    categories={data.view.categories}
    {categoryPath}
    {relDateShort}
    onChangeViewMode={(mode) => (viewMode = mode)}
    onChangeSortMode={(mode) => (sortMode = mode)}
    onCreateDocument={createDocument}
    onOpenDocument={openDocument}
    onOpenSearch={() => (searchModalOpen = true)}
    onToggleStar={toggleStar}
    onMoveDocument={moveDocumentToCategory}
    onDuplicateDocument={duplicateDocument}
    onDeleteDocument={deleteDocument}
    onUpdateDocumentColor={updateDocumentColor}
  />

  <NotesEditor
    {selectedDoc}
    categories={data.view.categories}
    blocks={data.view.blocks}
    images={attachmentImages}
    files={attachmentFiles}
    {uploading}
    {uploadProgress}
    {categoryPickerOpen}
    {saveState}
    {saveStatusVisible}
    editorSourceKey={`${selectedDoc?.id ?? 'notes-empty'}:${workspaceRevision}`}
    {wordCount}
    {charCount}
    {readTime}
    {doneCount}
    checklistCount={checklistBlocks.length}
    {currentTitle}
    {categoryPath}
    {relDate}
    {relDateShort}
    {attachmentHref}
    onRenameDocument={renameDocument}
    onSetDocumentCategory={setDocumentCategory}
    onToggleCategoryPicker={() => (categoryPickerOpen = !categoryPickerOpen)}
    onCloseCategoryPicker={() => (categoryPickerOpen = false)}
    onUploadAttachment={uploadAttachment}
    onUploadFiles={uploadFiles}
    onDeleteAttachment={deleteAttachment}
    onDeleteDocument={deleteDocument}
    onRestoreDocument={restoreDocument}
    onDeleteDocumentPermanently={deleteDocumentPermanently}
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
      Folder
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
      activeSmartFolder={selectedSmartFolder}
      {smartFolders}
      tags={data.view.tags}
      activeTagId={selectedTagId}
      {sidebarWidth}
      {expandedCategories}
      {renamingCategoryId}
      {renameValue}
      {canCreateSubcategory}
      {categoryCount}
      {categoryPath}
      {tagCount}
      onSelectSmartFolder={selectSmartFolder}
      onSelectCategory={selectCategory}
      onSelectTag={selectTag}
      onMoveDocumentToCategory={moveDocumentIdToCategory}
      onToggleCategory={toggleCategory}
      onCreateCategory={createCategory}
      onStartRename={startRename}
      onCommitRename={commitRename}
      onCancelRename={cancelRename}
      onDeleteCategory={deleteCategory}
      onRenameInput={(value) => (renameValue = value)}
      onUpdateCategoryColor={updateCategoryColor}
      onStartSidebarResize={startSidebarResize}
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
      {viewMode}
      {sortMode}
      categories={data.view.categories}
      {categoryPath}
      {relDateShort}
      onChangeViewMode={(mode) => (viewMode = mode)}
      onChangeSortMode={(mode) => (sortMode = mode)}
      onCreateDocument={createDocument}
      onOpenDocument={openDocument}
      onOpenSearch={() => (searchModalOpen = true)}
      onToggleStar={toggleStar}
      onMoveDocument={moveDocumentToCategory}
      onDuplicateDocument={duplicateDocument}
      onDeleteDocument={deleteDocument}
      onUpdateDocumentColor={updateDocumentColor}
    />
  </div>
{/if}

{#if searchModalOpen}
  <div class="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-sm">
    <div class="mx-auto mt-10 max-w-2xl overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)]">
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <Search size={16} class="text-[var(--text-faint)]" />
        <input
          bind:value={searchQuery}
          placeholder="Search title and note content"
          class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <button type="button" onclick={() => (searchModalOpen = false)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-primary)]" aria-label="Kapat">
          <X size={16} />
        </button>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-[var(--border)] px-4 py-3 text-xs">
        <select bind:value={searchCategoryId} class="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1 text-[var(--text-secondary)] outline-none">
          <option value="">All categories</option>
          {#each data.view.categories as category (category.id)}
            <option value={category.id}>{categoryPath(category.id)}</option>
          {/each}
        </select>
        <select bind:value={searchDateRange} class="rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1 text-[var(--text-secondary)] outline-none">
          <option value="all">Any time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <button
          type="button"
          onclick={() => (searchHasAttachment = !searchHasAttachment)}
          class="rounded-md border border-[var(--border)] px-2 py-1 {searchHasAttachment ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}"
        >
          Has attachment
        </button>
        <button
          type="button"
          onclick={() => (searchOnlyStarred = !searchOnlyStarred)}
          class="rounded-md border border-[var(--border)] px-2 py-1 {searchOnlyStarred ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}"
        >
          Starred
        </button>
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-2">
        {#each searchResults as result (result.id)}
          <a
            href={`/notes?doc=${result.id}`}
            onclick={() => {
              searchModalOpen = false;
              mobilePane = 'editor';
            }}
            class="block rounded-md px-3 py-2 no-underline transition-colors hover:bg-[var(--panel-soft)]"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">{result.title}</div>
              <div class="shrink-0 text-[11px] text-[var(--text-faint)]">{categoryPath(result.category_id)}</div>
            </div>
            <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
              {@html highlightedSnippet(result)}
            </p>
          </a>
        {/each}
        {#if debouncedQuery.trim() && searchResults.length === 0}
          <div class="px-4 py-10 text-center text-sm text-[var(--text-muted)]">Eslesen not bulunamadi.</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if shortcutsOpen}
  <div class="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-sm">
    <div class="mx-auto mt-16 max-w-md rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-card)]">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Keyboard size={16} />
          Shortcuts
        </div>
        <button type="button" onclick={() => (shortcutsOpen = false)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-primary)]" aria-label="Kapat">
          <X size={16} />
        </button>
      </div>
      <div class="space-y-2 text-sm text-[var(--text-secondary)]">
        <div class="flex justify-between gap-4"><span>New note</span><kbd>Cmd N</kbd></div>
        <div class="flex justify-between gap-4"><span>Search</span><kbd>Cmd K</kbd></div>
        <div class="flex justify-between gap-4"><span>Delete note</span><kbd>Cmd Delete</kbd></div>
        <div class="flex justify-between gap-4"><span>Star note</span><kbd>Cmd D</kbd></div>
        <div class="flex justify-between gap-4"><span>Move folder</span><kbd>Cmd Shift M</kbd></div>
      </div>
    </div>
  </div>
{/if}
