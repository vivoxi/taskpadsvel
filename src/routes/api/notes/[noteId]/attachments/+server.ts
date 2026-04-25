import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { deleteNoteUploadFile, resolveNoteUploadAbsolutePath } from '$lib/server/notes-v2-files';
import { notesValidationJsonResponse } from '$lib/server/notes-v2-errors';
import { supabaseAdmin } from '$lib/server/supabase';
import { UPLOADS_DIR } from '$lib/server/uploads';
import {
  buildNoteUploadPath,
  validateAttachmentFile
} from '$lib/notes-v2/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw error(400, 'file is required');
    }

    validateAttachmentFile(file);

    const { data: note, error: noteError } = await supabaseAdmin
      .from('notes')
      .select('id')
      .eq('id', params.noteId)
      .maybeSingle();

    if (noteError) throw error(500, noteError.message);
    if (!note) throw error(404, 'Note not found');

    const relativePath = buildNoteUploadPath(params.noteId, file.name);
    const absolutePath = resolveNoteUploadAbsolutePath(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);

    const { data, error: insertError } = await supabaseAdmin
      .from('note_attachments')
      .insert({
        note_id: params.noteId,
        file_name: file.name,
        file_path: relativePath,
        file_size: file.size,
        mime_type: file.type || null
      })
      .select('id, note_id, file_name, file_path, file_size, mime_type, created_at')
      .single();

    if (insertError) {
      await deleteNoteUploadFile(relativePath);
      throw error(500, insertError.message);
    }

    await supabaseAdmin
      .from('notes')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.noteId);

    return json(
      {
        ...(data as Record<string, unknown>),
        public_url: `/api/notes/${params.noteId}/attachments/${String(data.id)}/download`
      },
      { status: 201 }
    );
  } catch (caughtError) {
    const response = notesValidationJsonResponse(caughtError);
    if (response) return response;
    throw caughtError;
  }
};
