import type { TaskAttachment } from './types';

export function getTaskAttachmentsForWeek(
  attachments: TaskAttachment[],
  taskId: string,
  weekKey: string
): TaskAttachment[] {
  return attachments.filter(
    (attachment) => attachment.task_id === taskId && attachment.week_key === weekKey
  );
}
