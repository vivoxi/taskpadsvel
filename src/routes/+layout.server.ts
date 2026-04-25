import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { isAdminAuthRequired } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
  authRequired: isAdminAuthRequired({
    adminPassword: privateEnv.ADMIN_PASSWORD,
    publicAuthRequired: publicEnv.PUBLIC_AUTH_REQUIRED
  })
});
