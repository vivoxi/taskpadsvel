import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAuthMock, fromMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  fromMock: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
  requireAuth: requireAuthMock
}));

vi.mock('$lib/server/supabase', () => ({
  supabaseAdmin: {
    from: fromMock
  }
}));

import { POST } from '../src/routes/api/preferences/+server';

describe('preferences API', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    fromMock.mockReset();
    requireAuthMock.mockReturnValue(null);
  });

  it('upserts a batch of preferences', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockReturnValue({
      upsert: upsertMock
    });

    const response = await POST({
      request: new Request('http://localhost/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          entries: [
            { key: 'notes:v1', value: { state: { today: 'Ship fix' } }, updatedAt: '2026-04-03T10:00:00.000Z' },
            { key: 'pomodoro:v1', value: { snapshot: { mode: 'focus' } }, updatedAt: '2026-04-03T10:00:00.000Z' }
          ]
        })
      })
    } as never);

    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          key: 'notes:v1',
          value: { state: { today: 'Ship fix' } },
          updated_at: '2026-04-03T10:00:00.000Z'
        },
        {
          key: 'pomodoro:v1',
          value: { snapshot: { mode: 'focus' } },
          updated_at: '2026-04-03T10:00:00.000Z'
        }
      ],
      { onConflict: 'key' }
    );
    expect(await response.json()).toEqual({ success: true });
  });
});
