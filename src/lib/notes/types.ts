import type { NoteCategory } from '$lib/planner/types';

export type CategoryNode = NoteCategory & { children: CategoryNode[] };
