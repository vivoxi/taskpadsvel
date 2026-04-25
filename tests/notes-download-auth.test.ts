import { describe, expect, it } from 'vitest';
import { _requireAuth } from '../src/lib/server/auth';

/**
 * Tests that the auth guard used by the notes attachment download endpoint
 * (GET /api/notes/[noteId]/attachments/[attachmentId]/download) rejects
 * requests that are missing or have invalid Bearer tokens.
 */
describe('notes protected download auth guard', () => {
  function makeDownloadRequest(authHeader?: string): Request {
    return new Request('http://localhost/api/notes/note-1/attachments/att-1/download', {
      method: 'GET',
      headers: authHeader ? { Authorization: authHeader } : {}
    });
  }

  it('rejects download when password is set and no Authorization header is present', async () => {
    const request = makeDownloadRequest();
    const response = _requireAuth(request, 'secret');
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects download with a malformed Authorization header', async () => {
    const request = makeDownloadRequest('Token secret');
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
  });

  it('rejects download with an incorrect password', async () => {
    const request = makeDownloadRequest('Bearer bad-password');
    const response = _requireAuth(request, 'secret');
    expect(response?.status).toBe(401);
  });

  it('allows download with the correct Bearer token', () => {
    const request = makeDownloadRequest('Bearer secret');
    expect(_requireAuth(request, 'secret')).toBeNull();
  });

  it('allows download when no password is configured (open instance)', () => {
    const request = makeDownloadRequest();
    expect(_requireAuth(request, undefined)).toBeNull();
  });
});
