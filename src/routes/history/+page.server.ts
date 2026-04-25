import { getHistoryViewData } from '$lib/server/planner';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

const LOCKED_VIEW = {
  completedTasks: [],
  carriedTasks: [],
  archivedTasks: [],
  attachmentCount: 0,
  summary: { completedCount: 0, carriedCount: 0, archivedCount: 0 }
};

export const load: PageServerLoad = async ({ request }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: process.env.ADMIN_PASSWORD,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  if (!canReadPage({ request, authRequired })) {
    return { view: LOCKED_VIEW, locked: true };
  }

  return { view: await getHistoryViewData(), locked: false };
};
