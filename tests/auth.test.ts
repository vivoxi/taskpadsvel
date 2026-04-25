import { describe, expect, it } from 'vitest';
import { _requireAuth, isAdminAuthRequired } from '../src/lib/server/auth';

describe('requireAuth', () => {
  it('allows mutations when no admin password is configured', () => {
    const request = new Request('http://localhost/api/task-instances', { method: 'POST' });

    expect(_requireAuth(request, undefined)).toBeNull();
  });

  it('rejects missing bearer tokens when a password is configured', async () => {
    const request = new Request('http://localhost/api/task-instances', { method: 'POST' });
    const response = _requireAuth(request, 'secret');

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('accepts the configured bearer token', () => {
    const request = new Request('http://localhost/api/task-instances', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' }
    });

    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('reports auth as required when ADMIN_PASSWORD is set even if PUBLIC_AUTH_REQUIRED is false', () => {
    expect(isAdminAuthRequired({ adminPassword: 'secret', publicAuthRequired: 'false' })).toBe(true);
  });

  it('reports auth as required when PUBLIC_AUTH_REQUIRED is true', () => {
    expect(isAdminAuthRequired({ adminPassword: '', publicAuthRequired: 'true' })).toBe(true);
  });
});
