import { getOneTimeViewData } from '$lib/server/planner';
import { isAdminAuthRequired, canReadPage } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

const LOCKED_VIEW = {
  selectedDocumentId: '',
  documents: [],
  blocks: []
};

export const load: PageServerLoad = async ({ request, url }) => {
  const authRequired = isAdminAuthRequired({
    adminPassword: process.env.ADMIN_PASSWORD,
    publicAuthRequired: process.env.PUBLIC_AUTH_REQUIRED
  });

  if (!canReadPage({ request, authRequired })) {
    return { view: LOCKED_VIEW, locked: true };
  }

  return { view: await getOneTimeViewData(url.searchParams.get('doc')), locked: false };
};
