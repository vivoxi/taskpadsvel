import { redirect } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ request, url }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: privateEnv.ADMIN_PASSWORD,
    publicAuthRequired: publicEnv.PUBLIC_AUTH_REQUIRED
  });

  const authenticated = canReadPage({ request, authRequired });

  if (authRequired && !authenticated && url.pathname !== '/login') {
    redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
  }

  return { authRequired, authenticated };
};
