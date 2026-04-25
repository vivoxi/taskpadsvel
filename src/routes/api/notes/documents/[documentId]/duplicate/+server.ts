import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sourceId = params.documentId;
  if (!sourceId) throw error(400, 'Document id is required');

  const [{ data: source, error: sourceError }, { data: sourceBlocks, error: blocksError }] =
    await Promise.all([
      supabaseAdmin
        .from('notes_documents')
        .select('*')
        .eq('id', sourceId)
        .single(),
      supabaseAdmin
        .from('note_blocks')
        .select('*')
        .eq('document_id', sourceId)
        .order('sort_order', { ascending: true })
    ]);

  if (sourceError) throw error(500, sourceError.message);
  if (blocksError) throw error(500, blocksError.message);

  const now = new Date().toISOString();
  const duplicateInput: Record<string, unknown> = {
    title: `${source.title ?? 'Untitled'} copy`,
    slug: null,
    kind: source.kind ?? 'note',
    category_id: source.category_id ?? null,
    starred: false,
    sort_order: Number(source.sort_order ?? 0) + 1,
    created_at: now,
    updated_at: now
  };
  if ('color' in source) duplicateInput.color = source.color ?? null;

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from('notes_documents')
    .insert(duplicateInput)
    .select('*')
    .single();

  if (duplicateError) throw error(500, duplicateError.message);

  const clonedBlocks = (sourceBlocks ?? []).map((block, index) => ({
    id: crypto.randomUUID(),
    document_id: duplicate.id,
    type: block.type,
    text: block.text ?? '',
    checked: block.checked,
    level: block.level,
    sort_order: Number(block.sort_order ?? index),
    created_at: now,
    updated_at: now
  }));

  if (clonedBlocks.length > 0) {
    const { error: insertBlocksError } = await supabaseAdmin.from('note_blocks').insert(clonedBlocks);
    if (insertBlocksError) throw error(500, insertBlocksError.message);
  }

  return json(duplicate);
};
