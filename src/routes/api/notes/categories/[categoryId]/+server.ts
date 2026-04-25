import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { categoryId } = params;
  if (!categoryId) throw error(400, 'Category id is required');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: Record<string, unknown> = {};

  if (typeof body?.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if ('parent_id' in (body ?? {})) {
    updates.parent_id = typeof body?.parent_id === 'string' ? body.parent_id : null;
  }
  if ('color' in (body ?? {})) {
    updates.color = typeof body?.color === 'string' ? body.color : null;
  }
  if (typeof body?.sort_order === 'number') {
    updates.sort_order = body.sort_order;
  }

  if (Object.keys(updates).length === 0) throw error(400, 'No valid fields to update');

  const { data, error: updateError } = await supabaseAdmin
    .from('note_categories')
    .update(updates)
    .eq('id', categoryId)
    .select('id, name, parent_id, color, sort_order')
    .single();

  if (updateError) throw error(500, updateError.message);

  return json(data);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { categoryId } = params;
  if (!categoryId) throw error(400, 'Category id is required');

  const { error: deleteError } = await supabaseAdmin
    .from('note_categories')
    .delete()
    .eq('id', categoryId);

  if (deleteError) throw error(500, deleteError.message);

  return json({ success: true });
};
