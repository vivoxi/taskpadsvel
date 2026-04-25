import { error, json } from '@sveltejs/kit';
import { normalizeBlocks } from '$lib/planner/blocks';
import { saveNoteBlocks } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const documentId = params.documentId;
  if (!documentId) throw error(400, 'Document id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tagData = await saveNoteBlocks(documentId, normalizeBlocks(body?.blocks));
  return json({ success: true, ...(tagData ?? {}) });
};
