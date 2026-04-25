import type { NoteCategory } from '$lib/planner/types';

export type CategoryNode = NoteCategory & { children: CategoryNode[] };
export type SmartFolderId = 'all' | 'starred' | 'recent' | 'trash';
