import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, isAdminAuthRequired } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authRequired = isAdminAuthRequired({
    adminPassword,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  // Already authenticated — send straight to the intended destination.
  if (!authRequired || cookies.get(SESSION_COOKIE_NAME) === adminPassword) {
    const next = url.searchParams.get('next') ?? '/dashboard';
    const safeNext = next.startsWith('/') ? next : '/dashboard';
    redirect(303, safeNext);
  }

  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const password = data.get('password')?.toString() ?? '';

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || !password || password !== adminPassword) {
      return fail(400, { error: 'Invalid password' });
    }

    cookies.set(SESSION_COOKIE_NAME, password, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    const next = url.searchParams.get('next') ?? '/dashboard';
    const safeNext = next.startsWith('/') ? next : '/dashboard';
    redirect(303, safeNext);
  }
};
