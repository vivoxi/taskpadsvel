import { getCalendarViewData } from '$lib/server/planner';
import { normalizeMonthKey } from '$lib/planner/dates';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

const LOCKED_VIEW = { monthKey: '', label: '', weeks: [], instances: [] };

export const load: PageServerLoad = async ({ request, url }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: process.env.ADMIN_PASSWORD,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  if (!canReadPage({ request, authRequired })) {
    return { view: LOCKED_VIEW, locked: true };
  }

  const monthKey = normalizeMonthKey(url.searchParams.get('month'));
  return { view: await getCalendarViewData(monthKey), locked: false };
};
