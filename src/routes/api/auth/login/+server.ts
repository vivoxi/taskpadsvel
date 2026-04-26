import { json } from '@sveltejs/kit';
import { applySessionCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({})) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !password || password !== adminPassword) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  applySessionCookie(cookies, password);

  return json({ ok: true });
};
