import { derived, writable } from 'svelte/store';
import { getSupabaseBrowserClient } from '$lib/client/supabase';
import type {
  NoteTag,
  NoteTagLink,
  NotesDocument,
  NotesViewData,
  PlannerBlock,
  TaskAttachment
} from '$lib/planner/types';

type NotesStoreState = NotesViewData;

const emptyState: NotesStoreState = {
  selectedDocumentId: '',
  documents: [],
  blocks: [],
  attachments: [],
  categories: [],
  tags: [],
  noteTags: []
};

export const notesStore = writable<NotesStoreState>(emptyState);
export const selectedNoteId = writable('');

export const selectedNote = derived([notesStore, selectedNoteId], ([$notesStore, $selectedNoteId]) =>
  $notesStore.documents.find((document) => document.id === $selectedNoteId)
);

export const noteTagsByDocument = derived(notesStore, ($notesStore) => {
  const byDocument = new Map<string, NoteTag[]>();
  const tagById = new Map($notesStore.tags.map((tag) => [tag.id, tag]));
  for (const link of $notesStore.noteTags) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    const current = byDocument.get(link.note_id) ?? [];
    current.push(tag);
    byDocument.set(link.note_id, current);
  }
  return byDocument;
});

export function hydrateNotesStore(view: NotesViewData) {
  notesStore.set({
    ...view,
    tags: view.tags ?? [],
    noteTags: view.noteTags ?? []
  });
  selectedNoteId.set(view.selectedDocumentId);
}

export function setSelectedNoteOptimistic(documentId: string) {
  selectedNoteId.set(documentId);
  notesStore.update((state) => ({ ...state, selectedDocumentId: documentId }));
}

export function patchNoteInStore(documentId: string, patch: Partial<NotesDocument>) {
  notesStore.update((state) => ({
    ...state,
    documents: state.documents.map((document) =>
      document.id === documentId ? { ...document, ...patch } : document
    )
  }));
}

export function upsertNoteInStore(note: NotesDocument) {
  notesStore.update((state) => {
    const exists = state.documents.some((document) => document.id === note.id);
    return {
      ...state,
      documents: exists
        ? state.documents.map((document) => (document.id === note.id ? { ...document, ...note } : document))
        : [note, ...state.documents]
    };
  });
}

export function removeNoteFromStore(documentId: string) {
  notesStore.update((state) => ({
    ...state,
    documents: state.documents.filter((document) => document.id !== documentId),
    noteTags: state.noteTags.filter((link) => link.note_id !== documentId),
    selectedDocumentId: state.selectedDocumentId === documentId ? state.documents.find((document) => document.id !== documentId)?.id ?? '' : state.selectedDocumentId
  }));
}

export function setNoteWorkspace(blocks: PlannerBlock[], attachments: TaskAttachment[]) {
  notesStore.update((state) => ({ ...state, blocks, attachments }));
}

export function setNoteTags(tags: NoteTag[], noteTags: NoteTagLink[], documentId?: string) {
  notesStore.update((state) => ({
    ...state,
    tags,
    noteTags: [
      ...state.noteTags.filter((link) =>
        documentId ? link.note_id !== documentId : !noteTags.some((next) => next.note_id === link.note_id)
      ),
      ...noteTags
    ]
  }));
}

export function subscribeToNotesRealtime() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel('taskpad-notes-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes_documents' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          removeNoteFromStore(String(payload.old.id));
          return;
        }

        const row = payload.new as Partial<NotesDocument> & { id?: string };
        if (!row.id) return;
        patchNoteInStore(String(row.id), {
          ...row,
          category_id: row.category_id ?? row.folder_id ?? null,
          folder_id: row.category_id ?? row.folder_id ?? null,
          starred: row.starred === true || row.is_starred === true,
          is_starred: row.starred === true || row.is_starred === true
        } as Partial<NotesDocument>);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'note_tags' },
      () => {
        // The next save or route load will refresh the denormalized tag list.
        // Keeping this subscription active prevents stale selected-note state
        // when another tab changes the current note.
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
