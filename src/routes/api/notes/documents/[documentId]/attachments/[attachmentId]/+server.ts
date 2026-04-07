import { error, json } from '@sveltejs/kit';
import { rm } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { NORMALIZED_UPLOADS_DIR, UPLOADS_DIR } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const attachmentId = params.attachmentId;
  const documentId = params.documentId;
  if (!attachmentId || !documentId) throw error(400, 'Attachment id and document id are required');

  const { data: attachment, error: fetchError } = await supabaseAdmin
    .from('task_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('note_document_id', documentId)
    .single();

  if (fetchError || !attachment) throw error(404, 'Attachment not found');

  const absolutePath = path.resolve(UPLOADS_DIR, attachment.file_path);
  if (absolutePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
    await rm(absolutePath, { force: true }).catch(() => undefined);
  }

  const { error: deleteError } = await supabaseAdmin
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (deleteError) throw error(500, deleteError.message);

  return json({ success: true });
};
