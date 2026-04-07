import { error, json } from '@sveltejs/kit';
import { createStarterBlocks, saveNoteBlocks } from '$lib/server/planner';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { DocumentKind } from '$lib/planner/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Untitled';
  const kind: DocumentKind = body?.kind === 'one-time' ? 'one-time' : 'note';

  const { data, error: insertError } = await supabaseAdmin
    .from('notes_documents')
    .insert({
      title,
      slug: null,
      kind
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  await saveNoteBlocks(data.id, createStarterBlocks(kind));
  return json(data);
};
