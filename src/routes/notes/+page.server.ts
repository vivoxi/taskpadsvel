import { getNotesViewData } from '$lib/server/planner';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
  view: await getNotesViewData(url.searchParams.get('doc'))
});
