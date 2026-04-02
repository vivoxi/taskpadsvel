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

  fromMock.mockImplementation((table: string) => {
    if (table !== 'weekly_schedule') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      delete: deleteMock,
      insert: insertMock
    };
  });

  return { eqDeleteMock, insertMock };
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
        linked_task_type: 'weekly'
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
      weekOfMonth: 1,
      plannerNotes: {},
      weeklyTasks: [weeklyTask],
      monthlyTasks: []
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
      linkedTaskType: 'weekly'
    });
    expect(await response.json()).toEqual([{ id: 'block-1', task_title: 'Bank reconciliation' }]);
  });

  it('parses fenced AI responses and links by task title fallback', async () => {
    const { insertMock } = makeWeeklyScheduleTable([{ id: 'block-2' }]);

    generateScheduleTextMock.mockResolvedValue(`\`\`\`json
[
  {
    "day": "Monday",
    "start_time": "10:00",
    "end_time": "12:00",
    "task_title": "Bank reconciliation",
    "notes": "Use planner note slot"
  }
]
\`\`\``);

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
          plannerNotes: {
            Monday: '10:00-12:00 Bank reconciliation'
          },
          weeklyTasks: [weeklyTask],
          monthlyTasks: []
        })
      })
    } as never);

    expect(generateScheduleTextMock).toHaveBeenCalledTimes(1);

    expect(insertMock).toHaveBeenCalledTimes(1);
    const firstInsertCall = insertMock.mock.calls.at(0);
    if (!firstInsertCall) {
      throw new Error('Expected insert to be called');
    }
    const insertedRows = firstInsertCall[0] as Array<Record<string, unknown>>;
    expect(parseScheduleBlockDetails(String(insertedRows[0].notes))).toMatchObject({
      notes: 'Use planner note slot',
      linkedTaskId: 'weekly-1',
      linkedTaskType: 'weekly'
    });
    expect(await response.json()).toEqual([{ id: 'block-2' }]);
  });
});
