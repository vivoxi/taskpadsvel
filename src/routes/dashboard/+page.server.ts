import { getMonthViewData } from '$lib/server/planner';
import { normalizeMonthKey } from '$lib/planner/dates';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

const LOCKED_VIEW = {
  monthKey: '',
  label: '',
  weeks: [],
  templates: [],
  instances: [],
  softAssignments: {},
  settings: null,
  capacity: {
    available_hours: 0,
    planned_hours: 0,
    remaining_hours: 0,
    overflow_hours: 0,
    unassigned_hours: 0
  },
  schedule: {
    block_count: 0,
    locked_count: 0,
    split_candidate_count: 0,
    overflow_warning: null
  }
};

export const load: PageServerLoad = async ({ request, url }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: process.env.ADMIN_PASSWORD,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  if (!canReadPage({ request, authRequired })) {
    return { view: LOCKED_VIEW, locked: true };
  }

  const monthKey = normalizeMonthKey(url.searchParams.get('month'));
  return { view: await getMonthViewData(monthKey), locked: false };
};
