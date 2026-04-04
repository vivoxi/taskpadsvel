import { describe, expect, it } from 'vitest';
import { getTaskAttachmentsForWeek } from '../src/lib/taskAttachments';
import type { TaskAttachment } from '../src/lib/types';

describe('task attachment helpers', () => {
  it('returns only attachments for the requested task and week', () => {
    const attachments: TaskAttachment[] = [
      {
        id: 'a1',
        task_id: 'task-1',
        filename: 'a1.png',
        original_name: 'a1.png',
        mime_type: 'image/png',
        url: '/uploads/2026-W14/a1.png',
        week_key: '2026-W14',
        created_at: '2026-04-01T00:00:00.000Z'
      },
      {
        id: 'a2',
        task_id: 'task-1',
        filename: 'a2.png',
        original_name: 'a2.png',
        mime_type: 'image/png',
        url: '/uploads/2026-W15/a2.png',
        week_key: '2026-W15',
        created_at: '2026-04-08T00:00:00.000Z'
      },
      {
        id: 'a3',
        task_id: 'task-2',
        filename: 'a3.png',
        original_name: 'a3.png',
        mime_type: 'image/png',
        url: '/uploads/2026-W14/a3.png',
        week_key: '2026-W14',
        created_at: '2026-04-01T00:00:00.000Z'
      }
    ];

    expect(getTaskAttachmentsForWeek(attachments, 'task-1', '2026-W14')).toEqual([
      attachments[0]
    ]);
  });
});
