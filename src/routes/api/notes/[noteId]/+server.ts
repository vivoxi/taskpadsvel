import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { deleteNoteRow, getNoteDetail, updateNoteRow } from '$lib/server/notes-v2';
import { validateUpdateNoteInput } from '$lib/notes-v2/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const note = await getNoteDetail(params.noteId);
  if (!note) throw error(404, 'Note not found');
  return json(note);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const patch = validateUpdateNoteInput(body);
  const note = await updateNoteRow(params.noteId, patch);
  if (!note) throw error(404, 'Note not found');
  return json(note);
};

export const DELETE: RequestHandler = async ({ params, request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const deleted = await deleteNoteRow(params.noteId, url.searchParams.get('permanent') === '1');
  if (!deleted) throw error(404, 'Note not found');
  return new Response(null, { status: 204 });
};
