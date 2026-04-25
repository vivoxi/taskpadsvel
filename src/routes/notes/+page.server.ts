import { getNoteDetail, listNoteCategories, listNotes } from '$lib/server/notes-v2';
import { isAdminAuthRequired } from '$lib/server/auth';
import { canReadNotesPage } from '$lib/server/notes-v2-errors';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: process.env.ADMIN_PASSWORD,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  if (!canReadNotesPage({ request, authRequired })) {
    return {
      categories: [],
      notes: [],
      selectedNote: null,
      locked: true
    };
  }

  const categories = await listNoteCategories();
  const notes = await listNotes();
  const requestedNoteId = url.searchParams.get('note');
  const initialNoteId = requestedNoteId ?? notes[0]?.id ?? null;
  const selectedNote = initialNoteId ? await getNoteDetail(initialNoteId) : null;

  return {
    categories,
    notes,
    selectedNote,
    locked: false
  };
};
