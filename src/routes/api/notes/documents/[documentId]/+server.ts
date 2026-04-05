import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
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

  const { error: blockDeleteError } = await supabaseAdmin
    .from('note_blocks')
    .delete()
    .eq('document_id', documentId);

  if (blockDeleteError) throw error(500, blockDeleteError.message);

  const { error: docDeleteError } = await supabaseAdmin.from('notes_documents').delete().eq('id', documentId);
  if (docDeleteError) throw error(500, docDeleteError.message);

  return json({ success: true });
};
