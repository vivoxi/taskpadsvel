import { readFile } from 'fs/promises';
import path from 'path';
import { error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { resolveNoteUploadAbsolutePath } from '$lib/server/notes-v2-files';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

function getMimeType(filePath: string, fallback: string | null): string {
  if (fallback) return fallback;

  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  return types[ext] ?? 'application/octet-stream';
}

export const GET: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { data, error: queryError } = await supabaseAdmin
    .from('note_attachments')
    .select('id, note_id, file_name, file_path, mime_type')
    .eq('id', params.attachmentId)
    .eq('note_id', params.noteId)
    .maybeSingle();

  if (queryError) throw error(500, queryError.message);
  if (!data) throw error(404, 'Attachment not found');

  const absolutePath = resolveNoteUploadAbsolutePath(String(data.file_path));

  try {
    const fileData = await readFile(absolutePath);
    return new Response(fileData, {
      headers: {
        'Content-Type': getMimeType(String(data.file_path), data.mime_type ? String(data.mime_type) : null),
        'Content-Disposition': `inline; filename="${encodeURIComponent(String(data.file_name))}"`
      }
    });
  } catch {
    throw error(404, 'Attachment file not found');
  }
};
