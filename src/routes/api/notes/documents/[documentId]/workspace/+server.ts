import { error, json } from '@sveltejs/kit';
import { normalizeBlocks } from '$lib/planner/blocks';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPublicUploadPath } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const [{ data: blockRows, error: blockError }, { data: attachmentRows, error: attachmentError }] =
    await Promise.all([
      supabaseAdmin
        .from('note_blocks')
        .select('*')
        .eq('document_id', documentId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('task_attachments')
        .select('*')
        .eq('note_document_id', documentId)
        .order('created_at', { ascending: false })
    ]);

  if (blockError) throw error(500, blockError.message);
  if (attachmentError) throw error(500, attachmentError.message);

  return json({
    blocks: normalizeBlocks(blockRows ?? []),
    attachments: (attachmentRows ?? []).map((row) => ({
      id: String(row.id),
      task_instance_id: row.task_instance_id ? String(row.task_instance_id) : null,
      note_document_id: row.note_document_id ? String(row.note_document_id) : null,
      file_name: String(row.file_name ?? 'attachment'),
      file_path: String(row.file_path ?? ''),
      file_size: typeof row.file_size === 'number' ? row.file_size : null,
      mime_type: row.mime_type ? String(row.mime_type) : null,
      public_url: row.public_url ? String(row.public_url) : getPublicUploadPath(String(row.file_path ?? '')),
      created_at: String(row.created_at ?? new Date().toISOString())
    }))
  });
};
