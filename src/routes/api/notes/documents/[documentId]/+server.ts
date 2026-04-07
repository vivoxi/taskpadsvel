import { error, json } from '@sveltejs/kit';
import { rm } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { NORMALIZED_UPLOADS_DIR, UPLOADS_DIR } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) throw error(400, 'Title is required');

  const { error: updateError } = await supabaseAdmin
    .from('notes_documents')
    .update({
      title,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId);

  if (updateError) throw error(500, updateError.message);

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from('task_attachments')
    .select('id, file_path')
    .eq('note_document_id', documentId);

  if (attachmentsError) throw error(500, attachmentsError.message);

  const { error: blockDeleteError } = await supabaseAdmin
    .from('note_blocks')
    .delete()
    .eq('document_id', documentId);

  if (blockDeleteError) throw error(500, blockDeleteError.message);

  if ((attachments ?? []).length > 0) {
    for (const attachment of attachments) {
      const absolutePath = path.resolve(UPLOADS_DIR, attachment.file_path);
      if (absolutePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
        await rm(absolutePath, { force: true }).catch(() => undefined);
      }
    }

    const { error: attachmentDeleteError } = await supabaseAdmin
      .from('task_attachments')
      .delete()
      .eq('note_document_id', documentId);

    if (attachmentDeleteError) throw error(500, attachmentDeleteError.message);
  }

  const { error: docDeleteError } = await supabaseAdmin.from('notes_documents').delete().eq('id', documentId);
  if (docDeleteError) throw error(500, docDeleteError.message);

  return json({ success: true });
};
