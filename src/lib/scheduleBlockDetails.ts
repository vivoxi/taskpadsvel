import type { TaskType } from './types';

const SCHEDULE_BLOCK_META_PREFIX = '__TASKPAD_SCHEDULE__';
const LINKABLE_TASK_TYPES: TaskType[] = ['weekly', 'monthly'];

export interface ParsedScheduleBlockDetails {
  notes: string;
  completed: boolean;
  linkedTaskId: string | null;
  linkedTaskType: TaskType | null;
  linkedInstanceKey: string | null;
}

export function parseScheduleBlockDetails(rawNotes: string | null | undefined): ParsedScheduleBlockDetails {
  const value = rawNotes ?? '';

  if (!value.startsWith(SCHEDULE_BLOCK_META_PREFIX)) {
    return {
      notes: value,
      completed: false,
      linkedTaskId: null,
      linkedTaskType: null,
      linkedInstanceKey: null
    };
  }

  const newlineIndex = value.indexOf('\n');
  const metadataLine = newlineIndex === -1 ? value : value.slice(0, newlineIndex);
  const notes = newlineIndex === -1 ? '' : value.slice(newlineIndex + 1);

  try {
    const metadata = JSON.parse(metadataLine.slice(SCHEDULE_BLOCK_META_PREFIX.length)) as {
      completed?: boolean;
      linkedTaskId?: string;
      linkedTaskType?: TaskType;
      linkedInstanceKey?: string;
    };

    return {
      notes,
      completed: metadata.completed === true,
      linkedTaskId: typeof metadata.linkedTaskId === 'string' ? metadata.linkedTaskId : null,
      linkedTaskType:
        metadata.linkedTaskType && LINKABLE_TASK_TYPES.includes(metadata.linkedTaskType)
          ? metadata.linkedTaskType
          : null,
      linkedInstanceKey:
        typeof metadata.linkedInstanceKey === 'string' ? metadata.linkedInstanceKey : null
    };
  } catch {
    return {
      notes: value,
      completed: false,
      linkedTaskId: null,
      linkedTaskType: null,
      linkedInstanceKey: null
    };
  }
}

export function serializeScheduleBlockDetails(
  notes: string,
  completed: boolean,
  linkedTaskId: string | null = null,
  linkedTaskType: TaskType | null = null,
  linkedInstanceKey: string | null = null
): string {
  const normalizedNotes = notes.trimEnd();

  if (!completed && !linkedTaskId && !linkedTaskType && !linkedInstanceKey) {
    return normalizedNotes;
  }

  const metadata = `${SCHEDULE_BLOCK_META_PREFIX}${JSON.stringify({
    completed,
    linkedTaskId,
    linkedTaskType,
    linkedInstanceKey
  })}`;
  return normalizedNotes ? `${metadata}\n${normalizedNotes}` : metadata;
}
