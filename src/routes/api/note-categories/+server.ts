import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { createCategoryRow, listNoteCategories } from '$lib/server/notes-v2';
import { validateCategoryInput } from '$lib/notes-v2/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const categories = await listNoteCategories();
  return json({ categories });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const input = validateCategoryInput(body);
  const category = await createCategoryRow(input);
  return json(category, { status: 201 });
};
