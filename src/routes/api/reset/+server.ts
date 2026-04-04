import { error, json } from '@sveltejs/kit';
import { takeSnapshotWithClient } from '$lib/snapshotCore';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body?.type;
  const currentKey = typeof body?.currentKey === 'string' ? body.currentKey : '';

  if ((type !== 'weekly' && type !== 'monthly') || !currentKey) {
    throw error(400, 'type and currentKey are required');
  }

  const { data: logRow, error: logError } = await supabaseAdmin
    .from('reset_log')
    .select('last_reset_key')
    .eq('type', type)
    .maybeSingle();

  if (logError) throw error(500, logError.message);

  if (logRow?.last_reset_key === currentKey) {
    return json({ success: true, alreadyReset: true });
  }

  if (logRow?.last_reset_key) {
    await takeSnapshotWithClient(supabaseAdmin, type, logRow.last_reset_key);
  }

  const { error: resetError } = await supabaseAdmin
    .from('tasks')
    .update({ completed: false })
    .eq('type', type);

  if (resetError) throw error(500, resetError.message);

  const { error: upsertError } = await supabaseAdmin
    .from('reset_log')
    .upsert({ type, last_reset_key: currentKey }, { onConflict: 'type' });

  if (upsertError) throw error(500, upsertError.message);

  return json({ success: true, alreadyReset: false });
};
