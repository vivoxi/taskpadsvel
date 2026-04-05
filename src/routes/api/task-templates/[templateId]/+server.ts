import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const templateId = params.templateId;
  if (!templateId) throw error(400, 'Template id is required');

  const { error: instanceDeleteError } = await supabaseAdmin
    .from('task_instances')
    .delete()
    .eq('template_id', templateId);

  if (instanceDeleteError) throw error(500, instanceDeleteError.message);

  const { error: templateDeleteError } = await supabaseAdmin
    .from('task_templates')
    .delete()
    .eq('id', templateId);

  if (templateDeleteError) throw error(500, templateDeleteError.message);

  return json({ success: true });
};
