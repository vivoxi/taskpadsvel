import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScheduleBlockDetails } from '../src/lib/scheduleBlockDetails';
import { serializeTaskDetails } from '../src/lib/taskDetails';
import type { Task } from '../src/lib/types';

const { requireAuthMock, generateScheduleTextMock, generateRuleBasedScheduleMock, fromMock } =
  vi.hoisted(() => ({
    requireAuthMock: vi.fn(),
    generateScheduleTextMock: vi.fn(),
    generateRuleBasedScheduleMock: vi.fn(),
    fromMock: vi.fn()
  }));

vi.mock('$lib/server/auth', () => ({
  requireAuth: requireAuthMock
}));

vi.mock('$lib/server/ai', () => ({
  generateScheduleText: generateScheduleTextMock
}));

vi.mock('$lib/server/ruleScheduler', () => ({
  generateRuleBasedSchedule: generateRuleBasedScheduleMock
}));

vi.mock('$lib/server/supabase', () => ({
  supabaseAdmin: {
    from: fromMock
  }
}));

import { POST } from '../src/routes/api/schedule/generate/+server';

function makeWeeklyScheduleTable(data: unknown[] = []) {
  const eqDeleteMock = vi.fn().mockResolvedValue({ error: null });
  const deleteMock = vi.fn(() => ({ eq: eqDeleteMock }));
  const selectMock = vi.fn().mockResolvedValue({ data, error: null });
  const insertMock = vi.fn(((rows: unknown[]) => ({ select: selectMock })) as (
    rows: unknown[]
  ) => {
    select: typeof selectMock;
  });
  const snapshotMaybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });

  fromMock.mockImplementation((table: string) => {
    if (table === 'weekly_schedule') {
      return {
        delete: deleteMock,
        insert: insertMock
      };
    }

    if (table === 'history_snapshots') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: snapshotMaybeSingleMock
            }))
          }))
        }))
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { eqDeleteMock, insertMock, snapshotMaybeSingleMock };
}

describe('schedule generate API', () => {
  const weeklyTask: Task = {
    id: 'weekly-1',
    title: 'Bank reconciliation',
    type: 'weekly',
    completed: false,
    notes: serializeTaskDetails('', 2, null, 'Monday'),
    created_at: '2026-04-01T10:00:00.000Z'
  };

  beforeEach(() => {
    requireAuthMock.mockReset();
    generateScheduleTextMock.mockReset();
    generateRuleBasedScheduleMock.mockReset();
    fromMock.mockReset();
    requireAuthMock.mockReturnValue(null);
  });

  it('stores rule-based schedule blocks with linked task metadata', async () => {
    const { eqDeleteMock, insertMock } = makeWeeklyScheduleTable([
      { id: 'block-1', task_title: 'Bank reconciliation' }
    ]);

    generateRuleBasedScheduleMock.mockReturnValue([
      {
        day: 'Monday',
        start_time: '10:00',
        end_time: '12:00',
        task_title: 'Bank reconciliation',
        notes: 'Focus block',
        linked_task_id: 'weekly-1',
        linked_task_type: 'weekly',
        linked_instance_key: 'weekly:weekly-1:2026-W14'
      }
    ]);

    const response = await POST({
      request: new Request('http://localhost/api/schedule/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          mode: 'rules',
          weekKey: '2026-W14',
          weekOfMonth: 1,
          plannerNotes: {},
          weeklyTasks: [weeklyTask],
          monthlyTasks: []
        })
      })
    } as never);

    expect(generateRuleBasedScheduleMock).toHaveBeenCalledWith({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 1,
      plannerNotes: {},
      weeklyTasks: [weeklyTask],
      monthlyTasks: [],
      carryoverTaskTitles: []
    });
    expect(eqDeleteMock).toHaveBeenCalledWith('week_key', '2026-W14');

    expect(insertMock).toHaveBeenCalledTimes(1);
    const firstInsertCall = insertMock.mock.calls.at(0);
    if (!firstInsertCall) {
      throw new Error('Expected insert to be called');
    }
    const insertedRows = firstInsertCall[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      week_key: '2026-W14',
      day: 'Monday',
      start_time: '10:00',
      end_time: '12:00',
      task_title: 'Bank reconciliation',
      sort_order: 0
    });
    expect(parseScheduleBlockDetails(String(insertedRows[0].notes))).toMatchObject({
      notes: 'Focus block',
      completed: false,
      linkedTaskId: 'weekly-1',
      linkedTaskType: 'weekly',
      linkedInstanceKey: 'weekly:weekly-1:2026-W14'
    });
    expect(await response.json()).toEqual([{ id: 'block-1', task_title: 'Bank reconciliation' }]);
  });

  it('uses monthly instances from This Month and ignores stale AI mode payloads', async () => {
    const { insertMock } = makeWeeklyScheduleTable([{ id: 'block-2' }]);

    generateRuleBasedScheduleMock.mockReturnValue([
      {
        day: 'Friday',
        start_time: '14:00',
        end_time: '16:00',
        task_title: 'Month close',
        notes: 'From This Month board',
        linked_task_id: 'm1',
        linked_task_type: 'monthly',
        linked_instance_key: 'monthly:m1:2026-M04'
      }
    ]);

    const response = await POST({
      request: new Request('http://localhost/api/schedule/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test'
        },
        body: JSON.stringify({
          mode: 'ai',
          weekKey: '2026-W14',
          weekOfMonth: 1,
          plannerNotes: {},
          weeklyTasks: [weeklyTask],
          monthlyInstances: [
            {
              id: 'm1',
              title: 'Month close',
              type: 'monthly',
              completed: false,
              notes: '',
              created_at: '2026-04-01T10:00:00.000Z',
              scheduling_notes: '',
              estimated_hours: 2,
              preferred_week_of_month: 1,
              preferred_day: 'Friday',
              category: null,
              template_id: 'm1',
              period_key: '2026-M04',
              period_type: 'monthly',
              instance_key: 'monthly:m1:2026-M04'
            }
          ]
        })
      })
    } as never);

    expect(generateScheduleTextMock).not.toHaveBeenCalled();
    expect(generateRuleBasedScheduleMock).toHaveBeenCalledWith({
      weekKey: '2026-W14',
      monthKey: '2026-M04',
      weekOfMonth: 1,
      plannerNotes: {},
      weeklyTasks: [weeklyTask],
      monthlyTasks: undefined,
      monthlyInstances: [
        expect.objectContaining({
          instance_key: 'monthly:m1:2026-M04',
          preferred_week_of_month: 1,
          preferred_day: 'Friday'
        })
      ],
      carryoverTaskTitles: []
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const firstInsertCall = insertMock.mock.calls.at(0);
    if (!firstInsertCall) {
      throw new Error('Expected insert to be called');
    }
    const insertedRows = firstInsertCall[0] as Array<Record<string, unknown>>;
    expect(parseScheduleBlockDetails(String(insertedRows[0].notes))).toMatchObject({
      notes: 'From This Month board',
      linkedTaskId: 'm1',
      linkedTaskType: 'monthly',
      linkedInstanceKey: 'monthly:m1:2026-M04'
    });
    expect(await response.json()).toEqual([{ id: 'block-2' }]);
  });
});
