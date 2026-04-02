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

import { PATCH } from '../src/routes/api/task/[taskId]/+server';

describe('task API PATCH', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    fromMock.mockReset();
    requireAuthMock.mockReturnValue(null);
  });

  it('updates only allowed task fields', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'task-1',
        title: 'Updated title',
        completed: true,
        notes: 'Updated notes'
      },
      error: null
    });
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));

    fromMock.mockReturnValue({
      update: updateMock
    });

    const response = await PATCH({
      request: new Request('http://localhost/api/task/task-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          title: 'Updated title',
          completed: true,
          notes: 'Updated notes',
          type: 'random',
          created_at: 'should-not-pass'
        })
      }),
      params: { taskId: 'task-1' }
    } as never);

    expect(updateMock).toHaveBeenCalledWith({
      title: 'Updated title',
      completed: true,
      notes: 'Updated notes'
    });
    expect(eqMock).toHaveBeenCalledWith('id', 'task-1');
    expect(await response.json()).toEqual({
      id: 'task-1',
      title: 'Updated title',
      completed: true,
      notes: 'Updated notes'
    });
  });

  it('rejects requests without valid fields', async () => {
    await expect(
      PATCH({
        request: new Request('http://localhost/api/task/task-1', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test'
          },
          body: JSON.stringify({ type: 'weekly' })
        }),
        params: { taskId: 'task-1' }
      } as never)
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'No valid fields to update' }
    });
  });
});
