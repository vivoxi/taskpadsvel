import path from 'path';

export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? 'uploads');
export const NORMALIZED_UPLOADS_DIR = path.normalize(UPLOADS_DIR) + path.sep;

export function getPublicUploadPath(relativePath: string): string {
  return `/uploads/${relativePath.replace(/^\/+/, '')}`;
}
