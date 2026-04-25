/**
 * Call at the top of every non-GET +server.ts handler.
 * Returns a 401 Response if auth fails, or null if auth passes.
 */
export function requireAuth(request: Request): Response | null {
  return _requireAuth(request, process.env.ADMIN_PASSWORD);
}

/**
 * Use in +page.server.ts load functions to gate private page data.
 * Returns false when auth is required but the request has no valid Bearer token.
 */
export function canReadPage(event: { request: Request; authRequired: boolean }): boolean {
  if (!event.authRequired) return true;
  return _requireAuth(event.request, process.env.ADMIN_PASSWORD) === null;
}

export function isAdminAuthRequired(input: {
  adminPassword: string | undefined;
  publicAuthRequired: string | undefined;
}): boolean {
  return Boolean(input.adminPassword?.trim()) || input.publicAuthRequired === 'true';
}

/**
 * Pure function for testing — accepts password directly.
 */
export function _requireAuth(request: Request, password: string | undefined): Response | null {
  if (!password) return null;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.slice(7);
  if (token !== password) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}
