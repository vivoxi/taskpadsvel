import { getOneTimeViewData } from '$lib/server/planner';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
  view: await getOneTimeViewData(url.searchParams.get('doc'))
});
