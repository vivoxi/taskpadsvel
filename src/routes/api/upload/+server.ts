import { json, error } from '@sveltejs/kit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const UPLOADS_DIR = '/app/uploads';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const taskId = formData.get('taskId') as string | null;
  const weekKey = formData.get('weekKey') as string | null;

  if (!file || !taskId || !weekKey) {
    throw error(400, 'Missing required fields: file, taskId, weekKey');
  }

  const ext = path.extname(file.name);
  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  const dirPath = path.join(UPLOADS_DIR, weekKey);
  const filePath = path.join(dirPath, filename);

  // Path traversal guard
  const normalizedBase = path.normalize(UPLOADS_DIR) + path.sep;
  if (!filePath.startsWith(normalizedBase)) {
    throw error(400, 'Invalid path');
  }

  await mkdir(dirPath, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const url = `/uploads/${weekKey}/${filename}`;

  const { data, error: dbError } = await supabaseAdmin
    .from('task_attachments')
    .insert({
      task_id: taskId,
      filename,
      original_name: file.name,
      mime_type: file.type || null,
      url,
      week_key: weekKey
    })
    .select()
    .single();

  if (dbError) throw error(500, dbError.message);
  return json(data);
};
