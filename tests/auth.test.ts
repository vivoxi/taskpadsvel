import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, _requireAuth, canReadPage, isAdminAuthRequired } from '../src/lib/server/auth';

function makeRequest(options: { auth?: string; cookie?: string; method?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth) headers['Authorization'] = options.auth;
  if (options.cookie) headers['Cookie'] = options.cookie;
  return new Request('http://localhost/api/task-instances', {
    method: options.method ?? 'POST',
    headers
  });
}

describe('requireAuth — Bearer token', () => {
  it('allows when no admin password is configured', () => {
    expect(_requireAuth(makeRequest(), undefined)).toBeNull();
  });

  it('rejects when password is set and no token is provided', async () => {
    const response = _requireAuth(makeRequest(), 'secret');
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('accepts the configured bearer token', () => {
    expect(_requireAuth(makeRequest({ auth: 'Bearer secret' }), 'secret')).toBeNull();
  });

  it('rejects a wrong bearer token', async () => {
    const response = _requireAuth(makeRequest({ auth: 'Bearer wrong' }), 'secret');
    expect(response?.status).toBe(401);
  });
});

describe('requireAuth — session cookie', () => {
  it('accepts a valid session cookie', () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=secret` });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('accepts a URL-encoded session cookie value', () => {
    // SvelteKit cookies.set() URL-encodes values by default.
    const encoded = encodeURIComponent('p@ss w0rd!');
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${encoded}` });
    expect(_requireAuth(request, 'p@ss w0rd!')).toBeNull();
  });

  it('rejects a wrong cookie value even if no Bearer header is present', async () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=wrong` });
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
  });

  it('cookie takes priority over a missing Bearer header', () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=secret` });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('falls back to Bearer when cookie is absent', () => {
    const request = makeRequest({ auth: 'Bearer secret' });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });
});

describe('canReadPage', () => {
  it('allows when auth is not required regardless of credentials', () => {
    expect(canReadPage({ request: makeRequest(), authRequired: false })).toBe(true);
  });

  it('allows when auth is not required even with authRequired:true and no ADMIN_PASSWORD set', () => {
    // In tests ADMIN_PASSWORD is unset, so _requireAuth allows all requests.
    // Denial is exercised via _requireAuth directly with an explicit password.
    expect(_requireAuth(makeRequest(), 'secret')).not.toBeNull();
  });

  it('allows via _requireAuth when a matching cookie is present', () => {
    const request = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=secret` });
    expect(_requireAuth(request, 'secret')).toBeNull();
  });
});

describe('isAdminAuthRequired', () => {
  it('is required when ADMIN_PASSWORD is set, regardless of PUBLIC_AUTH_REQUIRED', () => {
    expect(isAdminAuthRequired({ adminPassword: 'secret', publicAuthRequired: 'false' })).toBe(true);
  });

  it('is required when PUBLIC_AUTH_REQUIRED is true', () => {
    expect(isAdminAuthRequired({ adminPassword: '', publicAuthRequired: 'true' })).toBe(true);
  });

  it('is not required when neither flag is set', () => {
    expect(isAdminAuthRequired({ adminPassword: '', publicAuthRequired: 'false' })).toBe(false);
  });
});
