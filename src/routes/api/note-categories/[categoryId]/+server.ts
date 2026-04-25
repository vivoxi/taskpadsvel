import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { deleteCategoryRow, updateCategoryRow } from '$lib/server/notes-v2';
import { validateCategoryInput } from '$lib/notes-v2/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const input = validateCategoryInput(body);
  const category = await updateCategoryRow(params.categoryId, input);
  if (!category) throw error(404, 'Category not found');
  return json(category);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  await deleteCategoryRow(params.categoryId);
  return new Response(null, { status: 204 });
};
