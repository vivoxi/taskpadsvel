import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { data, error: queryError } = await supabaseAdmin
    .from('note_categories')
    .select('id, name, parent_id, color, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (queryError) throw error(500, queryError.message);

  return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) throw error(400, 'Name is required');

  const parent_id = typeof body?.parent_id === 'string' ? body.parent_id : null;
  const color = typeof body?.color === 'string' ? body.color : null;

  const { data: maxRow } = await supabaseAdmin
    .from('note_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = ((maxRow?.sort_order as number | null) ?? -1) + 1;

  const { data, error: insertError } = await supabaseAdmin
    .from('note_categories')
    .insert({ name, parent_id, color, sort_order })
    .select('id, name, parent_id, color, sort_order')
    .single();

  if (insertError) throw error(500, insertError.message);

  return json(data, { status: 201 });
};
