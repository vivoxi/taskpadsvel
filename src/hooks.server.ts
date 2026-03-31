import type { Handle } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = '/app/uploads';
const NORMALIZED_UPLOADS_DIR = path.normalize(UPLOADS_DIR) + path.sep;

function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext.toLowerCase()] ?? 'application/octet-stream';
}

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/uploads/')) {
    const relativePath = event.url.pathname.slice('/uploads/'.length);
    const filePath = path.resolve(UPLOADS_DIR, relativePath);

    // Path traversal guard
    if (!filePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      return new Response(data, {
        headers: { 'Content-Type': getMimeType(ext) }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  return resolve(event);
};
