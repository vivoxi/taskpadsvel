import { error, json } from '@sveltejs/kit';
import { rm } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import {
  NORMALIZED_UPLOADS_DIR,
  UPLOADS_DIR,
  normalizeRelativeUploadPath
} from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('title' in (body ?? {})) {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) throw error(400, 'Title is required');
    updates.title = title;
  }
  if ('category_id' in (body ?? {})) {
    updates.category_id = typeof body?.category_id === 'string' ? body.category_id : null;
  }
  if ('folder_id' in (body ?? {})) {
    updates.category_id = typeof body?.folder_id === 'string' ? body.folder_id : null;
  }
  if ('starred' in (body ?? {})) {
    updates.starred = body?.starred === true;
  }
  if ('is_starred' in (body ?? {})) {
    updates.starred = body?.is_starred === true;
  }
  if ('deleted_at' in (body ?? {})) {
    updates.deleted_at = typeof body?.deleted_at === 'string' ? body.deleted_at : null;
  }
  if ('color' in (body ?? {})) {
    updates.color = typeof body?.color === 'string' ? body.color : null;
  }
  if (typeof body?.sort_order === 'number') {
    updates.sort_order = body.sort_order;
  }
  if ('cover_image_url' in (body ?? {})) {
    updates.cover_image_url = typeof body?.cover_image_url === 'string' ? body.cover_image_url : null;
  }
  if (typeof body?.word_count === 'number') {
    updates.word_count = body.word_count;
  }

  if (Object.keys(updates).length === 1) throw error(400, 'No valid fields to update');

  const { error: updateError } = await supabaseAdmin
    .from('notes_documents')
    .update(updates)
    .eq('id', documentId);

  if (updateError) throw error(500, updateError.message);

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const permanent = url.searchParams.get('permanent') === '1';
  if (!permanent) {
    const { error: softDeleteError } = await supabaseAdmin
      .from('notes_documents')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', documentId);

    if (!softDeleteError) {
      return json({ success: true, deleted: 'soft' });
    }

    if (softDeleteError.message.toLowerCase().includes('deleted_at')) {
      throw error(409, 'Trash is not available until the notes migration is applied.');
    }

    throw error(500, softDeleteError.message);
  }

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
      const absolutePath = path.resolve(UPLOADS_DIR, normalizeRelativeUploadPath(attachment.file_path));
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
