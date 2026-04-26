import { error, json } from '@sveltejs/kit';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { validateUploadFileNameLength } from '$lib/server/planner/validation';
import { supabaseAdmin } from '$lib/server/supabase';
import {
  UPLOADS_DIR,
  getPublicUploadPath,
  normalizeRelativeUploadPath
} from '$lib/server/uploads';
import type { RequestHandler } from './$types';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

type UploadFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isUploadFile(value: unknown): value is UploadFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof (value as UploadFile).arrayBuffer === 'function' &&
    'name' in value &&
    typeof (value as UploadFile).name === 'string' &&
    'size' in value &&
    typeof (value as UploadFile).size === 'number'
  );
}

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const form = await request.formData();
  const file = form.get('file');

  if (!isUploadFile(file)) {
    throw error(400, 'File is required');
  }

  if (file.size === 0) {
    throw error(400, 'File is empty');
  }

  validateUploadFileNameLength(file.name || 'attachment');

  const relativeDir = path.posix.join('notes', documentId);
  const absoluteDir = path.join(UPLOADS_DIR, relativeDir);
  await mkdir(absoluteDir, { recursive: true });

  const safeName = sanitizeFileName(file.name || 'attachment');
  const relativePath = normalizeRelativeUploadPath(
    path.posix.join(relativeDir, `${crypto.randomUUID()}-${safeName}`)
  );
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

  if (insertError) {
    const { rm } = await import('fs/promises');
    await rm(absolutePath, { force: true });
    throw error(500, insertError.message);
  }

  const { error: docUpdateError } = await supabaseAdmin
    .from('notes_documents')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', documentId);

  if (docUpdateError) throw error(500, docUpdateError.message);

  return json({
    ...data,
    public_url: getPublicUploadPath(relativePath)
  });
};
