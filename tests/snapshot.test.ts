import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeScheduleBlockDetails } from '../src/lib/scheduleBlockDetails';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn()
}));

vi.mock('$lib/supabase', () => ({
  supabase: {
    from: fromMock
  }
}));

import { takeSnapshot } from '../src/lib/snapshot';

describe('takeSnapshot', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('captures weekly tasks, planner notes, and schedule block completion', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'w1',
                  title: 'Weekly done',
                  type: 'weekly',
                  completed: true,
                  notes: '',
                  created_at: '2026-04-01T00:00:00.000Z'
                },
                {
                  id: 'w2',
                  title: 'Weekly missed',
                  type: 'weekly',
                  completed: false,
                  notes: '',
                  created_at: '2026-04-01T00:00:00.000Z'
                }
              ],
              error: null
            })
          }))
        };
      }

      if (table === 'weekly_plan') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [{ day: 'Monday', content: '10:00-12:00 Weekly done' }],
              error: null
            })
          }))
        };
      }

      if (table === 'weekly_schedule') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 's1',
                    week_key: '2026-W14',
                    day: 'Monday',
                    start_time: '10:00',
                    end_time: '12:00',
                    task_title: 'Weekly done',
                    notes: serializeScheduleBlockDetails('Completed block', true, 'w1', 'weekly'),
                    sort_order: 0
                  },
                  {
                    id: 's2',
                    week_key: '2026-W14',
                    day: 'Tuesday',
                    start_time: '14:00',
                    end_time: '15:00',
                    task_title: 'Weekly missed',
                    notes: serializeScheduleBlockDetails('Missed block', false, 'w2', 'weekly'),
                    sort_order: 1
                  }
                ],
                error: null
              })
            }))
          }))
        };
      }

      if (table === 'history_snapshots') {
        return {
          upsert: upsertMock
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await takeSnapshot('weekly', '2026-W14');

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, options] = upsertMock.mock.calls[0];

    expect(options).toEqual({ onConflict: 'period_type,period_key' });
    expect(payload).toMatchObject({
      period_type: 'weekly',
      period_key: '2026-W14',
      planner_notes: {
        Monday: '10:00-12:00 Weekly done'
      },
      completion_rate: 0.5
    });
    expect(payload.completed_tasks).toHaveLength(1);
    expect(payload.missed_tasks).toHaveLength(1);
    expect(payload.completed_schedule_blocks).toHaveLength(1);
    expect(payload.missed_schedule_blocks).toHaveLength(1);
  });

  it('captures monthly snapshots without weekly planner data', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'm1',
                  title: 'Monthly task',
                  type: 'monthly',
                  completed: true,
                  notes: '',
                  created_at: '2026-04-01T00:00:00.000Z'
                }
              ],
              error: null
            })
          }))
        };
      }

      if (table === 'history_snapshots') {
        return {
          upsert: upsertMock
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await takeSnapshot('monthly', '2026-M04');

    const [payload] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      period_type: 'monthly',
      period_key: '2026-M04',
      planner_notes: {},
      completed_schedule_blocks: [],
      missed_schedule_blocks: [],
      completion_rate: 1
    });
  });
});
