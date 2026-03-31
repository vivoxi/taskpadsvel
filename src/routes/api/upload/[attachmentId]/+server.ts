import { json, error } from '@sveltejs/kit';
import { unlink } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const UPLOADS_DIR = '/app/uploads';

export const DELETE: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { attachmentId } = params;

  const { data: attachment, error: fetchError } = await supabaseAdmin
    .from('task_attachments')
    .select('filename, week_key')
    .eq('id', attachmentId)
    .single();

  if (fetchError || !attachment) throw error(404, 'Attachment not found');

  // Build file path and validate
  const filePath = path.join(UPLOADS_DIR, attachment.week_key ?? '', attachment.filename);
  const normalizedBase = path.normalize(UPLOADS_DIR) + path.sep;
  if (!filePath.startsWith(normalizedBase)) {
    throw error(400, 'Invalid path');
  }

  try {
    await unlink(filePath);
  } catch {
    // File missing on disk is non-fatal — continue to remove DB row
  }

  const { error: dbError } = await supabaseAdmin
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) throw error(500, dbError.message);
  return json({ success: true });
};
