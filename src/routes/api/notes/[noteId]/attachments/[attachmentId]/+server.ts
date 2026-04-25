import { rm } from 'fs/promises';
import { error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { resolveNoteUploadAbsolutePath } from '$lib/server/notes-v2-files';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { data, error: queryError } = await supabaseAdmin
    .from('note_attachments')
    .select('id, note_id, file_path')
    .eq('id', params.attachmentId)
    .eq('note_id', params.noteId)
    .maybeSingle();

  if (queryError) throw error(500, queryError.message);
  if (!data) throw error(404, 'Attachment not found');

  const absolutePath = resolveNoteUploadAbsolutePath(String(data.file_path));
  await rm(absolutePath, { force: true });

  const { error: deleteError } = await supabaseAdmin
    .from('note_attachments')
    .delete()
    .eq('id', params.attachmentId)
    .eq('note_id', params.noteId);

  if (deleteError) throw error(500, deleteError.message);

  await supabaseAdmin
    .from('notes')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.noteId);

  return new Response(null, { status: 204 });
};
