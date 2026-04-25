import { describe, expect, it } from 'vitest';
import { _requireAuth } from '../src/lib/server/auth';

/**
 * Tests that the auth guard used by GET /api/history behaves correctly.
 * The handler calls requireAuth(request) which delegates to _requireAuth.
 */
describe('GET /api/history auth guard', () => {
  function makeHistoryRequest(authHeader?: string): Request {
    return new Request('http://localhost/api/history', {
      method: 'GET',
      headers: authHeader ? { Authorization: authHeader } : {}
    });
  }

  it('returns 401 when password is configured and no token is sent', async () => {
    const request = makeHistoryRequest();
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when token does not match password', async () => {
    const request = makeHistoryRequest('Bearer wrong-password');
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns null (passes) when correct token is provided', () => {
    const request = makeHistoryRequest('Bearer secret');
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('returns null (passes) when no password is configured', () => {
    const request = makeHistoryRequest();
    expect(_requireAuth(request, undefined)).toBeNull();
  });

  it('rejects a Bearer prefix without a token value', async () => {
    const request = makeHistoryRequest('Bearer ');
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
  });
});
