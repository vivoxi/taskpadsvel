import { json, error } from '@sveltejs/kit';
import { unlink } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { NORMALIZED_UPLOADS_DIR, UPLOADS_DIR } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { taskId } = params;

  const { data: attachments, error: attachmentsError } = await supabaseAdmin
    .from('task_attachments')
    .select('id, filename, week_key')
    .eq('task_id', taskId);

  if (attachmentsError) throw error(500, attachmentsError.message);

  for (const attachment of attachments ?? []) {
    const filePath = path.join(UPLOADS_DIR, attachment.week_key ?? '', attachment.filename);

    if (!filePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
      throw error(400, 'Invalid path');
    }

    try {
      await unlink(filePath);
    } catch {
      // Missing files on disk should not block task deletion.
    }
  }

  const { error: deleteAttachmentsError } = await supabaseAdmin
    .from('task_attachments')
    .delete()
    .eq('task_id', taskId);

  if (deleteAttachmentsError) throw error(500, deleteAttachmentsError.message);

  const { error: deleteTaskError } = await supabaseAdmin.from('tasks').delete().eq('id', taskId);
  if (deleteTaskError) throw error(500, deleteTaskError.message);

  return json({ success: true });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { taskId } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (typeof body !== 'object' || body === null) {
    throw error(400, 'Body must be an object');
  }

  const allowed = ['title', 'completed', 'notes'] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (body as Record<string, unknown>)) {
      update[key] = (body as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(update).length === 0) {
    throw error(400, 'No valid fields to update');
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('tasks')
    .update(update)
    .eq('id', taskId)
    .select()
    .single();

  if (dbError) throw error(500, dbError.message);
  return json(data);
};
