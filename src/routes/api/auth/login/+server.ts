import { json } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({})) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !password || password !== adminPassword) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  cookies.set(SESSION_COOKIE_NAME, password, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });

  return json({ ok: true });
};
