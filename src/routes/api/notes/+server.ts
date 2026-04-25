import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { createNoteRow, listNotes } from '$lib/server/notes-v2';
import { validateCreateNoteInput } from '$lib/notes-v2/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const notes = await listNotes({
    q: url.searchParams.get('q') ?? undefined,
    category_id: url.searchParams.get('category_id'),
    starred: url.searchParams.get('starred') === '1',
    trash: url.searchParams.get('trash') === '1'
  });

  return json({ notes });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const input = validateCreateNoteInput(body);
  const note = await createNoteRow(input);
  return json(note, { status: 201 });
};
