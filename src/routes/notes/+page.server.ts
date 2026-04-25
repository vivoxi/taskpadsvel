import { getNoteDetail, listNoteCategories, listNotes } from '$lib/server/notes-v2';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const categories = await listNoteCategories();
  const notes = await listNotes();
  const requestedNoteId = url.searchParams.get('note');
  const initialNoteId = requestedNoteId ?? notes[0]?.id ?? null;
  const selectedNote = initialNoteId ? await getNoteDetail(initialNoteId) : null;

  return {
    categories,
    notes,
    selectedNote
  };
};
