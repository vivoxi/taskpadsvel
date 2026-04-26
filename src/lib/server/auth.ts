export const SESSION_COOKIE_NAME = 'taskpad-session';

/**
 * Parses the Cookie header from a Request into a key→value map.
 * Values are URL-decoded to match what SvelteKit's cookies.set() stores.
 */
function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') ?? '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

/**
 * Call at the top of every non-GET +server.ts handler.
 * Returns a 401 Response if auth fails, or null if auth passes.
 * Accepts either the HttpOnly session cookie or an Authorization Bearer token.
 */
export function requireAuth(request: Request): Response | null {
  return _requireAuth(request, process.env.ADMIN_PASSWORD);
}

/**
 * Use in +page.server.ts load functions to gate private page data.
 * Returns false when auth is required but the request carries neither a valid
 * session cookie nor a valid Bearer token.
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
 * Checks the HttpOnly session cookie first, then falls back to the Bearer token.
 */
export function _requireAuth(request: Request, password: string | undefined): Response | null {
  if (!password) return null;

  // Prefer the HttpOnly session cookie (set by the /login page, present on SSR requests).
  const cookies = parseCookies(request);
  if (cookies[SESSION_COOKIE_NAME] === password) return null;

  // Fall back to Authorization: Bearer <token> for backward-compatible API clients.
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
