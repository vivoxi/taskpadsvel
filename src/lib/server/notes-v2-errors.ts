import { json } from '@sveltejs/kit';
import { canReadPage } from '$lib/server/auth';
import { NotesValidationError } from '$lib/notes-v2/validation';

export function notesValidationJsonResponse(caughtError: unknown): Response | null {
  if (caughtError instanceof NotesValidationError) {
    return json({ error: caughtError.message }, { status: caughtError.status });
  }

  return null;
}

export function canReadNotesPage(event: { request: Request; authRequired: boolean }): boolean {
  return canReadPage(event);
}
