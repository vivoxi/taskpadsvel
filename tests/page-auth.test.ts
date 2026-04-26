import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, _requireAuth, canReadPage } from '../src/lib/server/auth';
import { canReadNotesPage } from '../src/lib/server/notes-v2-errors';

function makeRequest(options: { auth?: string; cookie?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth) headers['Authorization'] = options.auth;
  if (options.cookie) headers['Cookie'] = options.cookie;
  return new Request('http://localhost/dashboard', { headers });
}

describe('canReadPage — no auth required', () => {
  it('always allows access when authRequired is false', () => {
    expect(canReadPage({ request: makeRequest(), authRequired: false })).toBe(true);
    expect(canReadPage({ request: makeRequest({ auth: 'Bearer anything' }), authRequired: false })).toBe(true);
    expect(canReadPage({ request: makeRequest({ cookie: `${SESSION_COOKIE_NAME}=anything` }), authRequired: false })).toBe(true);
  });
});

describe('canReadPage — auth required, session cookie', () => {
  it('allows access with a matching session cookie', () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=secret` });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('denies access with a wrong session cookie', () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=wrong` });
    expect(_requireAuth(request, 'secret')).not.toBeNull();
  });

  it('denies access with no credentials when password is set', () => {
    expect(_requireAuth(makeRequest(), 'secret')).not.toBeNull();
  });
});

describe('canReadPage — auth required, Bearer fallback', () => {
  it('allows access with correct Bearer token when no cookie is present', () => {
    const request = makeRequest({ auth: 'Bearer secret' });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('rejects access with wrong Bearer token', async () => {
    const request = makeRequest({ auth: 'Bearer bad' });
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

describe('canReadNotesPage delegates to canReadPage', () => {
  it('returns same result as canReadPage when authRequired is false', () => {
    const request = makeRequest();
    expect(canReadNotesPage({ request, authRequired: false })).toBe(
      canReadPage({ request, authRequired: false })
    );
  });

  it('returns same result as canReadPage when authRequired is true and no credentials', () => {
    const request = makeRequest();
    expect(canReadNotesPage({ request, authRequired: true })).toBe(
      canReadPage({ request, authRequired: true })
    );
  });
});
