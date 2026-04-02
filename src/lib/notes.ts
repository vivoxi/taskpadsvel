export type NotesState = {
  workspace: string;
  today: string;
  next: string;
  parkingLot: string;
  bullets: string[];
};

export const NOTES_STORAGE_KEY = 'taskpad:notes:v1';
export const NOTES_SUPABASE_KEY = 'notes:v1';

export type PersistedNotesState = {
  state: NotesState;
  updatedAt: string | null;
};

export function createDefaultNotesState(): NotesState {
  return {
    workspace: '',
    today: '',
    next: '',
    parkingLot: '',
    bullets: []
  };
}

function normalizeNotesState(value: unknown): NotesState {
  const parsed = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<NotesState>)
    : {};

  return {
    workspace: typeof parsed.workspace === 'string' ? parsed.workspace : '',
    today: typeof parsed.today === 'string' ? parsed.today : '',
    next: typeof parsed.next === 'string' ? parsed.next : '',
    parkingLot: typeof parsed.parkingLot === 'string' ? parsed.parkingLot : '',
    bullets: Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((item): item is string => typeof item === 'string')
      : []
  };
}

export function parseNotesState(raw: string | null | undefined): NotesState {
  if (!raw) return createDefaultNotesState();

  try {
    return normalizeNotesState(JSON.parse(raw));
  } catch {
    return createDefaultNotesState();
  }
}

export function parsePersistedNotesState(value: unknown): PersistedNotesState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed = value as Record<string, unknown>;
  const hasWrappedState =
    'state' in parsed && parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state);

  return {
    state: normalizeNotesState(hasWrappedState ? parsed.state : parsed),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
  };
}
