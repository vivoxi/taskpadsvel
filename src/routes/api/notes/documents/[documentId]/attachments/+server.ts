import { error, json } from '@sveltejs/kit';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { UPLOADS_DIR } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    throw error(400, 'File is required');
  }

  if (file.size === 0) {
    throw error(400, 'File is empty');
  }

  const relativeDir = path.join('notes', documentId);
  const absoluteDir = path.join(UPLOADS_DIR, relativeDir);
  await mkdir(absoluteDir, { recursive: true });

  const safeName = sanitizeFileName(file.name || 'attachment');
  const relativePath = path.join(relativeDir, `${crypto.randomUUID()}-${safeName}`);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(absolutePath, buffer);

  const { data, error: insertError } = await supabaseAdmin
    .from('task_attachments')
    .insert({
      note_document_id: documentId,
      task_instance_id: null,
      file_name: file.name || safeName,
      file_path: relativePath,
      mime_type: file.type || null
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  return json(data);
};
