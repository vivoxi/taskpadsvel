<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import {
    ChevronDown,
    Ellipsis,
    Folder,
    LoaderCircle,
    Plus,
    RefreshCcw,
    Search,
    Star,
    Trash2,
    Upload
  } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import NotesBlocksEditor from '$lib/components/notes-v2/NotesBlocksEditor.svelte';
  import { apiFetch, apiJson, apiSendJson } from '$lib/client/api';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import PanelCard from '$lib/components/ui/PanelCard.svelte';
  import { buildPlainText, buildPreview, createNoteBlock } from '$lib/notes-v2/validation';
  import { showConfirm } from '$lib/stores/confirm';
  import { authPassword } from '$lib/stores';
  import type { NoteCategory, NoteDetail, NoteSummary } from '$lib/notes-v2/types';
  import type { PageData } from './$types';

  type SaveState = 'saved' | 'saving' | 'error';
  type SmartFilter = 'all' | 'starred' | 'trash';

  let { data }: { data: PageData } = $props();

  let categories = $state<NoteCategory[]>([]);
  let notes = $state<NoteSummary[]>([]);
  let selectedNote = $state<NoteDetail | null>(null);
  let selectedCategoryFilter = $state<string | null>(null);
  let activeFilter = $state<SmartFilter>('all');
  let searchInput = $state('');
  let saveState = $state<SaveState>('saved');
  let loadingList = $state(false);
  let loadingNote = $state(false);
  let uploading = $state(false);
  let newCategoryName = $state('');
  let editingCategoryId = $state<string | null>(null);
  let editingCategoryName = $state('');
  let openCategoryMenuId = $state<string | null>(null);
  let attachmentsOpen = $state(true);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveInFlight = false;
  let queuedSave = false;
  let initializedFromLoad = false;
  let initialLocked = false;

  $effect(() => {
    if (initializedFromLoad) return;
    categories = [...data.categories];
    notes = [...data.notes];
    selectedNote = data.selectedNote;
    initialLocked = data.locked;
    initializedFromLoad = true;
  });

  $effect(() => {
    if (!$authPassword || !initialLocked || !initializedFromLoad) return;
    initialLocked = false;
    void refreshCategories();
    void refreshNotes({ keepSelection: true });
  });

  const sortedNotes = $derived.by(() =>
    [...notes].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  );

  function noteDateLabel(value: string): string {
    const date = new Date(value);
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function categoryColor(categoryId: string | null): string {
    return categories.find((category) => category.id === categoryId)?.color ?? 'var(--accent)';
  }

  function categoryName(categoryId: string | null): string {
    return categories.find((category) => category.id === categoryId)?.name ?? 'No folder';
  }

  function toSummary(note: NoteDetail): NoteSummary {
    return {
      id: note.id,
      title: note.title,
      preview: buildPreview(note.title, note.content),
      plain_text: buildPlainText(note.title, note.content),
      category_id: note.category_id,
      is_starred: note.is_starred,
      deleted_at: note.deleted_at,
      created_at: note.created_at,
      updated_at: note.updated_at,
      attachment_count: note.attachment_count
    };
  }

  function noteTypeLabel(note: Pick<NoteSummary, 'plain_text'> | NoteDetail): 'normal' | 'checklist' {
    if ('content' in note && note.content.some((block) => block.type === 'checklist')) {
      return 'checklist';
    }
    return 'normal';
  }

  function setSelectedNote(note: NoteDetail | null) {
    selectedNote = note;
    if (browser) {
      const url = new URL(window.location.href);
      if (note?.id) {
        url.searchParams.set('note', note.id);
      } else {
        url.searchParams.delete('note');
      }
      history.replaceState(history.state, '', url);
    }
  }

  function upsertSummary(summary: NoteSummary) {
    const existing = notes.findIndex((note) => note.id === summary.id);
    if (existing === -1) {
      notes = [summary, ...notes];
      return;
    }

    notes = notes.map((note) => (note.id === summary.id ? summary : note));
  }

  async function refreshCategories() {
    try {
      const payload = await apiJson<{ categories: NoteCategory[] }>('/api/note-categories');
      categories = payload.categories;
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to refresh folders');
    }
  }

  async function refreshNotes(options: { keepSelection?: boolean; nextSelectedId?: string | null } = {}) {
    loadingList = true;
    try {
      const params = new URLSearchParams();
      if (searchInput.trim()) params.set('q', searchInput.trim());
      if (selectedCategoryFilter) params.set('category_id', selectedCategoryFilter);
      if (activeFilter === 'starred') params.set('starred', '1');
      if (activeFilter === 'trash') params.set('trash', '1');

      const payload = await apiJson<{ notes: NoteSummary[] }>(`/api/notes?${params.toString()}`);
      notes = payload.notes;

      const selectedId = options.nextSelectedId ?? (options.keepSelection ? selectedNote?.id ?? null : null);
      if (selectedId && payload.notes.some((note) => note.id === selectedId)) {
        await loadNote(selectedId);
      } else if (payload.notes[0]) {
        await loadNote(payload.notes[0].id);
      } else {
        setSelectedNote(null);
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to refresh notes');
    } finally {
      loadingList = false;
    }
  }

  async function loadNote(noteId: string) {
    if (!noteId) return;
    if (selectedNote && selectedNote.id !== noteId && (saveTimer || saveState === 'saving')) {
      await flushSave();
    }
    loadingNote = true;
    try {
      const note = await apiJson<NoteDetail>(`/api/notes/${noteId}`);
      setSelectedNote(note);
      saveState = 'saved';
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to load note');
    } finally {
      loadingNote = false;
    }
  }

  async function createNote() {
    try {
      const note = await apiSendJson<NoteDetail>('/api/notes', 'POST', {
        title: 'Untitled',
        category_id: selectedCategoryFilter,
        content: [createNoteBlock('paragraph')]
      });

      if (activeFilter === 'trash') {
        activeFilter = 'all';
      }
      if (activeFilter === 'starred') {
        activeFilter = 'all';
      }

      upsertSummary(toSummary(note));
      setSelectedNote(note);
      saveState = 'saved';
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to create note');
    }
  }

  function updateSelectedNote(patch: Partial<NoteDetail>) {
    if (!selectedNote) return;
    const next = { ...selectedNote, ...patch };
    selectedNote = {
      ...next,
      preview: buildPreview(next.title, next.content),
      plain_text: buildPlainText(next.title, next.content)
    };
    upsertSummary(toSummary(selectedNote));
    scheduleSave();
  }

  function scheduleSave(delay = 800) {
    if (!selectedNote) return;
    saveState = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushSave();
    }, delay);
  }

  async function flushSave() {
    if (!selectedNote) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (saveInFlight) {
      queuedSave = true;
      return;
    }

    saveInFlight = true;
    const snapshot = structuredClone(selectedNote);

    try {
      const saved = await apiSendJson<NoteDetail>(`/api/notes/${snapshot.id}`, 'PATCH', {
        title: snapshot.title,
        content: snapshot.content,
        category_id: snapshot.category_id,
        is_starred: snapshot.is_starred,
        deleted_at: snapshot.deleted_at
      });

      if (selectedNote?.id === saved.id) {
        setSelectedNote(saved);
      }
      upsertSummary(toSummary(saved));
      saveState = 'saved';
    } catch (fetchError) {
      saveState = 'error';
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to save note');
    } finally {
      saveInFlight = false;
      if (queuedSave) {
        queuedSave = false;
        void flushSave();
      }
    }
  }

  async function moveToTrash() {
    if (!selectedNote) return;
    const noteId = selectedNote.id;
    const noteTitle = selectedNote.title;
    const confirmed = await showConfirm(`Move "${noteTitle}" to Trash?`, 'Move note');
    if (!confirmed) return;

    try {
      await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      notes = notes.filter((note) => note.id !== noteId);
      if (activeFilter === 'trash') {
        await refreshNotes({ keepSelection: false });
      } else {
        const next = notes[0]?.id ?? null;
        if (next) {
          await loadNote(next);
        } else {
          setSelectedNote(null);
        }
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to move note');
    }
  }

  async function restoreNote() {
    if (!selectedNote) return;
    try {
      const restored = await apiSendJson<NoteDetail>(`/api/notes/${selectedNote.id}`, 'PATCH', { deleted_at: null });
      upsertSummary(toSummary(restored));
      if (activeFilter === 'trash') {
        notes = notes.filter((note) => note.id !== restored.id);
        const next = notes[0]?.id ?? null;
        if (next) {
          await loadNote(next);
        } else {
          setSelectedNote(null);
        }
      } else {
        setSelectedNote(restored);
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to restore note');
    }
  }

  async function permanentlyDeleteNote() {
    if (!selectedNote) return;
    const noteId = selectedNote.id;
    const noteTitle = selectedNote.title;
    const confirmed = await showConfirm(`Delete "${noteTitle}" permanently?`, 'Delete forever');
    if (!confirmed) return;

    try {
      await apiFetch(`/api/notes/${noteId}?permanent=1`, { method: 'DELETE' });
      notes = notes.filter((note) => note.id !== noteId);
      const next = notes[0]?.id ?? null;
      if (next) {
        await loadNote(next);
      } else {
        setSelectedNote(null);
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to delete note');
    }
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    try {
      const category = await apiSendJson<NoteCategory>('/api/note-categories', 'POST', { name });
      categories = [...categories, category].sort((left, right) => left.sort_order - right.sort_order);
      newCategoryName = '';
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to create folder');
    }
  }

  async function saveCategoryRename(categoryId: string) {
    const name = editingCategoryName.trim();
    if (!name) return;

    try {
      const category = await apiSendJson<NoteCategory>(`/api/note-categories/${categoryId}`, 'PATCH', {
        name,
        color: categories.find((entry) => entry.id === categoryId)?.color ?? null
      });
      categories = categories.map((entry) => (entry.id === category.id ? category : entry));
      editingCategoryId = null;
      editingCategoryName = '';
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to rename folder');
    }
  }

  async function deleteCategory(categoryId: string) {
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category) return;
    const confirmed = await showConfirm(`Delete folder "${category.name}"? Notes will stay uncategorized.`, 'Delete folder');
    if (!confirmed) return;

    try {
      await apiFetch(`/api/note-categories/${categoryId}`, { method: 'DELETE' });
      categories = categories.filter((entry) => entry.id !== categoryId);
      notes = notes.map((note) => (note.category_id === categoryId ? { ...note, category_id: null } : note));
      if (selectedNote?.category_id === categoryId) {
        selectedNote = { ...selectedNote, category_id: null };
      }
      if (selectedCategoryFilter === categoryId) {
        selectedCategoryFilter = null;
        activeFilter = 'all';
        await refreshNotes({ keepSelection: true });
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to delete folder');
    }
  }

  async function handleAttachmentUpload(event: Event) {
    if (!selectedNote) return;
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    uploading = true;
    const noteId = selectedNote.id;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set('file', file);
        const response = await apiFetch(`/api/notes/${noteId}/attachments`, {
          method: 'POST',
          body: formData
        });
        const attachment = await response.json();
        if (selectedNote?.id === noteId) {
          selectedNote = {
            ...selectedNote,
            attachments: [attachment, ...selectedNote.attachments],
            attachment_count: selectedNote.attachment_count + 1
          };
          upsertSummary(toSummary(selectedNote));
        }
      }
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to upload attachment');
    } finally {
      input.value = '';
      uploading = false;
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!selectedNote) return;
    try {
      await apiFetch(`/api/notes/${selectedNote.id}/attachments/${attachmentId}`, { method: 'DELETE' });
      selectedNote = {
        ...selectedNote,
        attachments: selectedNote.attachments.filter((attachment) => attachment.id !== attachmentId),
        attachment_count: Math.max(0, selectedNote.attachment_count - 1)
      };
      upsertSummary(toSummary(selectedNote));
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : 'Failed to delete attachment');
    }
  }

  function toggleSelectedStar() {
    if (!selectedNote) return;
    updateSelectedNote({ is_starred: !selectedNote.is_starred });
    void flushSave();
  }

  function applySmartFilter(filter: SmartFilter) {
    activeFilter = filter;
    selectedCategoryFilter = null;
    void refreshNotes({ keepSelection: true });
  }

  function applyCategoryFilter(categoryId: string) {
    activeFilter = 'all';
    selectedCategoryFilter = categoryId;
    void refreshNotes({ keepSelection: true });
  }

  function handleSearchInput(event: Event) {
    searchInput = (event.currentTarget as HTMLInputElement).value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void refreshNotes({ keepSelection: true });
    }, 250);
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    if (saveTimer) clearTimeout(saveTimer);
  });
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="grid min-h-full grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_340px_minmax(0,1fr)]">
  <aside class="border-b border-[var(--border)] bg-[var(--panel-soft)] md:border-b-0 md:border-r">
    <div class="space-y-4 p-4">
      <Button variant="primary" className="w-full" onclick={createNote}>
        <Plus size={16} />
        New Note
      </Button>

      <label class="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-muted)]">
        <Search size={15} />
        <input
          class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          placeholder="Search notes"
          value={searchInput}
          oninput={handleSearchInput}
        />
      </label>

      <div class="space-y-1">
        <button
          type="button"
          class={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            activeFilter === 'all' && !selectedCategoryFilter
              ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'
          }`}
          onclick={() => applySmartFilter('all')}
        >
          <span>All Notes</span>
        </button>
        <button
          type="button"
          class={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            activeFilter === 'starred'
              ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'
          }`}
          onclick={() => applySmartFilter('starred')}
        >
          <span class="inline-flex items-center gap-2"><Star size={14} />Starred</span>
        </button>
        <button
          type="button"
          class={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            activeFilter === 'trash'
              ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'
          }`}
          onclick={() => applySmartFilter('trash')}
        >
          <span class="inline-flex items-center gap-2"><Trash2 size={14} />Trash</span>
        </button>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">Categories</h2>
          <span class="text-xs text-[var(--text-muted)]">{categories.length}</span>
        </div>

        <div class="space-y-2">
          {#each categories as category (category.id)}
            <div class={`relative rounded-lg border px-3 py-2 transition-colors ${selectedCategoryFilter === category.id ? 'border-[var(--accent)]/30 bg-[var(--panel)]' : 'border-[var(--border)] bg-[var(--panel)] hover:border-[var(--border-strong)]'}`}>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => applyCategoryFilter(category.id)}
                >
                  <span
                    class="h-2.5 w-2.5 rounded-full"
                    style={`background:${category.color ?? 'var(--accent)'}`}
                  ></span>
                  {#if editingCategoryId === category.id}
                    <input
                      class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none"
                      bind:value={editingCategoryName}
                      onkeydown={(event) => event.key === 'Enter' && saveCategoryRename(category.id)}
                    />
                  {:else}
                    <span class={`truncate ${selectedCategoryFilter === category.id ? 'text-[var(--text-primary)]' : ''}`}>
                      {category.name}
                    </span>
                  {/if}
                </button>

                {#if editingCategoryId === category.id}
                  <button type="button" class="text-xs text-[var(--accent)]" onclick={() => saveCategoryRename(category.id)}>
                    Save
                  </button>
                {:else}
                  <button
                    type="button"
                    class="rounded-md p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
                    onclick={() => {
                      openCategoryMenuId = openCategoryMenuId === category.id ? null : category.id;
                    }}
                    aria-label={`Folder actions for ${category.name}`}
                  >
                    <Ellipsis size={14} />
                  </button>
                  {#if openCategoryMenuId === category.id}
                    <div class="absolute right-3 top-10 z-10 w-32 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-strong)] p-1 shadow-[0_16px_32px_rgba(0,0,0,0.2)]">
                      <button
                        type="button"
                        class="block w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
                        onclick={() => {
                          editingCategoryId = category.id;
                          editingCategoryName = category.name;
                          openCategoryMenuId = null;
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        class="block w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                        onclick={() => {
                          openCategoryMenuId = null;
                          void deleteCategory(category.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="flex gap-2">
          <input
            class="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            placeholder="New folder"
            bind:value={newCategoryName}
            onkeydown={(event) => event.key === 'Enter' && createCategory()}
          />
          <button type="button" class="rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]" onclick={createCategory}>
            Add
          </button>
        </div>
      </div>
    </div>
  </aside>

  <section class="border-b border-[var(--border)] bg-[var(--bg)] md:border-b-0 md:border-r">
    <div class="border-b border-[var(--border)] px-4 py-4">
      <PageHeader
        title="Notes"
        subtitle={loadingList ? 'Refreshing…' : `${sortedNotes.length} note${sortedNotes.length === 1 ? '' : 's'}`}
      />
      {#if loadingList}
        <LoaderCircle class="mt-3 animate-spin text-[var(--text-muted)]" size={16} />
      {/if}
    </div>

    <div class="space-y-2 p-3">
      {#if sortedNotes.length === 0}
        <EmptyState
          title={activeFilter === 'trash' ? 'Trash is empty' : searchInput.trim() ? 'No matching notes' : selectedCategoryFilter ? 'Folder is empty' : 'Create your first note'}
          description={activeFilter === 'trash' ? 'Deleted notes will wait here.' : searchInput.trim() ? 'Try a shorter title or clear the search.' : selectedCategoryFilter ? 'New notes can start directly inside this folder.' : 'Notes stay lightweight here: title, blocks, attachments.'}
        />
      {/if}

      {#each sortedNotes as note (note.id)}
        <button
          type="button"
          class={`block w-full rounded-xl border px-4 py-3 text-left transition-colors ${
            selectedNote?.id === note.id
              ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
              : 'border-[var(--border)] bg-[var(--panel-soft)] hover:bg-[var(--panel)]'
          }`}
          onclick={() => loadNote(note.id)}
        >
          <div class="mb-2 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-[var(--text-primary)]">{note.title}</div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
                <span>{noteDateLabel(note.updated_at)}</span>
                <Badge className="capitalize">{noteTypeLabel(note)}</Badge>
              </div>
            </div>
            {#if note.is_starred}
              <Star size={14} class="fill-current text-[var(--warning)]" />
            {/if}
          </div>
          <div class="line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
            {note.preview || 'Empty note'}
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-[var(--text-faint)]">
            <span class="inline-flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" style={`background:${categoryColor(note.category_id)}`}></span>
              {categoryName(note.category_id)}
            </span>
            {#if note.attachment_count > 0}
              <span>{note.attachment_count} file{note.attachment_count === 1 ? '' : 's'}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </section>

  <section class="min-w-0 bg-[var(--bg)]">
    {#if !selectedNote}
      <div class="px-6 py-8 md:flex md:h-full md:items-center md:justify-center">
        <div class="w-full max-w-md">
          <EmptyState
            title="No note selected"
            description="Pick a note from the list or create a fresh one."
          >
            {#snippet icon()}
              <Folder size={32} />
            {/snippet}
          </EmptyState>
        </div>
      </div>
    {:else}
      <div class="flex h-full flex-col">
        <div class="border-b border-[var(--border)] px-6 py-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <button
                type="button"
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedNote.is_starred
                    ? 'border-[var(--warning)] bg-[rgba(245,158,11,0.12)] text-[var(--warning)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                onclick={toggleSelectedStar}
              >
                {selectedNote.is_starred ? 'Starred' : 'Star'}
              </button>
              <Badge className="capitalize">{noteTypeLabel(selectedNote)}</Badge>

              <select
                class="rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                value={selectedNote.category_id ?? ''}
                onchange={(event) =>
                  updateSelectedNote({
                    category_id: (event.currentTarget.value || null) as string | null
                  })}
              >
                <option value="">No folder</option>
                {#each categories as category (category.id)}
                  <option value={category.id}>{category.name}</option>
                {/each}
              </select>
            </div>

            <div class="flex items-center gap-2 text-sm">
              {#if loadingNote}
                <span class="text-[var(--text-muted)]">Loading...</span>
              {/if}
              <span
                class={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  saveState === 'saved'
                    ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success)]'
                    : saveState === 'saving'
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]'
                }`}
              >
                {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving...' : 'Error'}
              </span>
            </div>
          </div>

          <input
            class="w-full border-none bg-transparent text-3xl font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            value={selectedNote.title}
            placeholder="Untitled"
            maxlength="200"
            oninput={(event) => updateSelectedNote({ title: event.currentTarget.value })}
            onblur={() => void flushSave()}
          />
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-6 py-5">
          <NotesBlocksEditor
            blocks={selectedNote.content}
            on:change={(event) => updateSelectedNote({ content: event.detail })}
            on:blur={() => void flushSave()}
          />

          <PanelCard title="Attachments" eyebrow="Files" className="mt-8 bg-[var(--panel-soft)]">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs text-[var(--text-muted)]">
                  Images, PDFs and office files up to 10 MB.
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-md p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
                  onclick={() => (attachmentsOpen = !attachmentsOpen)}
                  aria-label="Toggle attachments"
                >
                  <ChevronDown size={15} class={`transition-transform ${attachmentsOpen ? 'rotate-180' : ''}`} />
                </button>
                <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                {#if uploading}
                  <LoaderCircle class="animate-spin" size={14} />
                {:else}
                  <Upload size={14} />
                {/if}
                Upload
                <input class="hidden" type="file" multiple onchange={handleAttachmentUpload} />
                </label>
              </div>
            </div>

            {#if attachmentsOpen}
              {#if selectedNote.attachments.length === 0}
                <EmptyState compact title="No attachments yet" description="Uploads live alongside the note instead of inside the text blocks." />
              {:else}
                <div class="space-y-3">
                  {#each selectedNote.attachments as attachment (attachment.id)}
                    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                      <div class="min-w-0">
                        <a
                          href={attachment.public_url}
                          target="_blank"
                          rel="noreferrer"
                          class="block truncate text-sm font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                        >
                          {attachment.file_name}
                        </a>
                        <div class="mt-1 text-xs text-[var(--text-faint)]">
                          {attachment.mime_type ?? 'file'}{#if attachment.file_size} · {Math.ceil(attachment.file_size / 1024)} KB{/if}
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                        onclick={() => deleteAttachment(attachment.id)}
                      >
                        Remove
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}
          </PanelCard>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
          <div class="text-xs text-[var(--text-muted)]">
            Updated {noteDateLabel(selectedNote.updated_at)} · {selectedNote.content.length} blocks
          </div>
          <div class="flex items-center gap-2">
            {#if selectedNote.deleted_at}
              <button
                type="button"
                class="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                onclick={restoreNote}
              >
                <RefreshCcw size={14} class="mr-1 inline" />
                Restore
              </button>
              <button
                type="button"
                class="rounded-lg border border-[rgba(239,68,68,0.35)] px-3 py-2 text-sm text-[var(--danger)]"
                onclick={permanentlyDeleteNote}
              >
                Delete Permanently
              </button>
            {:else}
              <button
                type="button"
                class="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--danger)]"
                onclick={moveToTrash}
              >
                <Trash2 size={14} class="mr-1 inline" />
                Move to Trash
              </button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </section>
</div>
