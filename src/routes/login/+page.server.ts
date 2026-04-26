import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, applySessionCookie, isAdminAuthRequired } from '$lib/server/auth';
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

    applySessionCookie(cookies, password);

    const next = url.searchParams.get('next') ?? '/dashboard';
    const safeNext = next.startsWith('/') ? next : '/dashboard';
    redirect(303, safeNext);
  }
};
