import path from 'path';
import { NotesValidationError } from '$lib/notes-v2/validation';
import { NORMALIZED_UPLOADS_DIR, UPLOADS_DIR, normalizeRelativeUploadPath } from '$lib/server/uploads';

export function resolveNoteUploadAbsolutePath(relativePath: string): string {
  const absolutePath = path.resolve(UPLOADS_DIR, normalizeRelativeUploadPath(relativePath));
  if (!absolutePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
    throw new NotesValidationError('Invalid upload path', 400);
  }
  return absolutePath;
}
