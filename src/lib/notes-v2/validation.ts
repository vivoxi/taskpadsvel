import {
  NOTE_BLOCK_TYPES,
  type NoteBlock,
  type NoteBlockType
} from '$lib/notes-v2/types';

const NOTE_BLOCK_TYPE_SET = new Set<string>(NOTE_BLOCK_TYPES);

export const MAX_NOTE_TITLE_LENGTH = 200;
export const MAX_BLOCK_TEXT_LENGTH = 5000;
export const MAX_NOTE_BLOCKS = 300;
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILE_NAME_LENGTH = 180;

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

type JsonRecord = Record<string, unknown>;

export class NotesValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'NotesValidationError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new NotesValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    throw new NotesValidationError(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new NotesValidationError(`${field} is too long`);
  }
  return trimmed;
}

export function isNoteBlockType(value: unknown): value is NoteBlockType {
  return typeof value === 'string' && NOTE_BLOCK_TYPE_SET.has(value);
}

export function createNoteBlock(type: NoteBlockType): NoteBlock {
  const id = crypto.randomUUID();
  if (type === 'divider') return { id, type };
  if (type === 'checklist') return { id, type, text: '', checked: false };
  return { id, type, text: '' };
}

export function validateNoteBlocks(value: unknown): NoteBlock[] {
  if (!Array.isArray(value)) {
    throw new NotesValidationError('content must be an array');
  }
  if (value.length > MAX_NOTE_BLOCKS) {
    throw new NotesValidationError(`content cannot exceed ${MAX_NOTE_BLOCKS} blocks`);
  }

  return value.map((entry, index) => validateNoteBlock(entry, index));
}

function validateNoteBlock(value: unknown, index: number): NoteBlock {
  if (!isRecord(value)) {
    throw new NotesValidationError(`block ${index + 1} must be an object`);
  }

  const type = value.type;
  if (!isNoteBlockType(type)) {
    throw new NotesValidationError(`block ${index + 1} has an unsupported type`);
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : crypto.randomUUID();

  if (type === 'divider') {
    return { id, type };
  }

  const text = asTrimmedString(value.text ?? '', `block ${index + 1} text`, MAX_BLOCK_TEXT_LENGTH, true);

  if (type === 'checklist') {
    return {
      id,
      type,
      text,
      checked: typeof value.checked === 'boolean' ? value.checked : false
    };
  }

  return { id, type, text } as NoteBlock;
}

export function buildPlainText(title: string, content: NoteBlock[]): string {
  return [title.trim(), ...content.map((block) => ('text' in block ? block.text.trim() : ''))]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function buildPreview(title: string, content: NoteBlock[]): string {
  const plainText = buildPlainText(title, content).replace(/\s+/g, ' ').trim();
  return plainText.slice(0, 180);
}

export function validateNoteTitle(value: unknown, fallback = 'Untitled'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > MAX_NOTE_TITLE_LENGTH) {
    throw new NotesValidationError(`title cannot exceed ${MAX_NOTE_TITLE_LENGTH} characters`);
  }
  return trimmed;
}

export function validateNullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new NotesValidationError(`${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new NotesValidationError(`${field} must be a valid uuid`);
  }
  return trimmed;
}

export function validateCreateNoteInput(value: unknown): {
  title: string;
  category_id: string | null;
  content: NoteBlock[];
} {
  const body = isRecord(value) ? value : {};
  return {
    title: validateNoteTitle(body.title, 'Untitled'),
    category_id: validateNullableUuid(body.category_id, 'category_id'),
    content: body.content === undefined ? [] : validateNoteBlocks(body.content)
  };
}

export function validateUpdateNoteInput(value: unknown): {
  title?: string;
  content?: NoteBlock[];
  category_id?: string | null;
  is_starred?: boolean;
  deleted_at?: string | null;
} {
  if (!isRecord(value)) {
    throw new NotesValidationError('request body must be an object');
  }

  const patch: {
    title?: string;
    content?: NoteBlock[];
    category_id?: string | null;
    is_starred?: boolean;
    deleted_at?: string | null;
  } = {};

  if ('title' in value) patch.title = validateNoteTitle(value.title, 'Untitled');
  if ('content' in value) patch.content = validateNoteBlocks(value.content);
  if ('category_id' in value) patch.category_id = validateNullableUuid(value.category_id, 'category_id');
  if ('is_starred' in value) {
    if (typeof value.is_starred !== 'boolean') {
      throw new NotesValidationError('is_starred must be a boolean');
    }
    patch.is_starred = value.is_starred;
  }
  if ('deleted_at' in value) {
    if (value.deleted_at !== null && typeof value.deleted_at !== 'string') {
      throw new NotesValidationError('deleted_at must be a string or null');
    }
    patch.deleted_at = value.deleted_at;
  }

  return patch;
}

export function validateCategoryInput(value: unknown): {
  name: string;
  color: string | null;
  sort_order?: number;
} {
  const body = isRecord(value) ? value : {};
  const name = asTrimmedString(body.name ?? '', 'name', 120);
  const color =
    body.color === null || body.color === undefined || body.color === ''
      ? null
      : asTrimmedString(body.color, 'color', 40);
  const sort_order =
    body.sort_order === undefined
      ? undefined
      : Number.isInteger(body.sort_order)
        ? Number(body.sort_order)
        : (() => {
            throw new NotesValidationError('sort_order must be an integer');
          })();

  return { name, color, sort_order };
}

export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/[^\w.\- ]+/g, '').trim();
  return base || 'file';
}

export function buildNoteUploadPath(noteId: string, fileName: string, uploadId: string = crypto.randomUUID()): string {
  const safeName = sanitizeUploadFileName(fileName);
  const lastDot = safeName.lastIndexOf('.');
  const ext = lastDot >= 0 ? safeName.slice(lastDot).toLowerCase() : '';
  return `notes/${noteId}/${uploadId}${ext}`.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function validateAttachmentFile(file: File) {
  if (file.name.trim().length === 0) {
    throw new NotesValidationError('File name is required');
  }
  if (file.name.length > MAX_UPLOAD_FILE_NAME_LENGTH) {
    throw new NotesValidationError(`File name cannot exceed ${MAX_UPLOAD_FILE_NAME_LENGTH} characters`);
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    throw new NotesValidationError('Unsupported file type');
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new NotesValidationError('File is too large');
  }
}
