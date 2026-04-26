import { afterAll, describe, expect, it } from 'vitest';
import { PATCH } from '../src/routes/api/task-instances/[instanceId]/+server';
import { GET as searchGet } from '../src/routes/api/search/+server';

function makeAuthRequest(body: unknown) {
  return new Request('http://localhost/api/task-instances/task-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret'
    },
    body: JSON.stringify(body)
  });
}

describe('task instance PATCH validation', () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'secret';

  it('rejects invalid week keys before hitting the database', async () => {
    await expect(
      PATCH({
        params: { instanceId: 'task-1' },
        request: makeAuthRequest({ week_key: 'bad-week' })
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid archived_at timestamps', async () => {
    await expect(
      PATCH({
        params: { instanceId: 'task-1' },
        request: makeAuthRequest({ archived_at: 'not-a-date' })
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects out-of-range hours_needed values', async () => {
    await expect(
      PATCH({
        params: { instanceId: 'task-1' },
        request: makeAuthRequest({ hours_needed: 100 })
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });

  afterAll(() => {
    process.env.ADMIN_PASSWORD = previousPassword;
  });
});

describe('search route auth', () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'secret';

  it('rejects unauthenticated search requests', async () => {
    const response = await searchGet({
      request: new Request('http://localhost/api/search?q=test'),
      url: new URL('http://localhost/api/search?q=test')
    } as never);

    expect(response.status).toBe(401);
  });

  afterAll(() => {
    process.env.ADMIN_PASSWORD = previousPassword;
  });
});
