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

import { PATCH, POST } from '../src/routes/api/tasks/+server';

describe('tasks collection API', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    fromMock.mockReset();
    requireAuthMock.mockReturnValue(null);
  });

  it('creates a task through the protected collection endpoint', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: 'task-1', title: 'Inbox', type: 'random', completed: false, notes: '' },
      error: null
    });
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const insertMock = vi.fn(() => ({ select: selectMock }));

    fromMock.mockReturnValue({
      insert: insertMock
    });

    const response = await POST({
      request: new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          title: 'Inbox',
          type: 'random',
          completed: false,
          notes: ''
        })
      })
    } as never);

    expect(insertMock).toHaveBeenCalledWith({
      title: 'Inbox',
      type: 'random',
      completed: false,
      notes: ''
    });
    expect(await response.json()).toMatchObject({
      id: 'task-1',
      title: 'Inbox'
    });
  });

  it('updates tasks by type through the protected collection endpoint', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));

    fromMock.mockReturnValue({
      update: updateMock
    });

    const response = await PATCH({
      request: new Request('http://localhost/api/tasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          taskType: 'random',
          updates: { completed: true }
        })
      })
    } as never);

    expect(updateMock).toHaveBeenCalledWith({ completed: true });
    expect(eqMock).toHaveBeenCalledWith('type', 'random');
    expect(await response.json()).toEqual({ success: true });
  });
});
