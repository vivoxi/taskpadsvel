import { getWeekViewData } from '$lib/server/planner';
import { normalizeWeekKey } from '$lib/planner/dates';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

const LOCKED_VIEW = {
  weekKey: '',
  monthKey: '',
  label: '',
  isCurrentWeek: false,
  todayDayName: null,
  days: [],
  tasks: [],
  tasksByDay: {},
  softAssignedTaskIds: [],
  settings: {
    id: '',
    label: '',
    working_day_start: '09:00',
    working_day_end: '17:00',
    break_start: '12:00',
    break_end: '13:00',
    buffer_minutes: 0,
    theme_mode: 'system' as const,
    created_at: '',
    updated_at: ''
  },
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
    return { view: LOCKED_VIEW, byDay: {}, locked: true };
  }

  const weekKey = normalizeWeekKey(url.searchParams.get('week'));
  const view = await getWeekViewData(weekKey);
  return { view, byDay: view.tasksByDay, locked: false };
};
