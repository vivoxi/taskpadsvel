export const NOTE_BLOCK_TYPES = ['heading', 'paragraph', 'checklist', 'bullet', 'divider'] as const;

export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number];

export type NoteHeadingBlock = {
  id: string;
  type: 'heading';
  text: string;
};

export type NoteParagraphBlock = {
  id: string;
  type: 'paragraph';
  text: string;
};

export type NoteChecklistBlock = {
  id: string;
  type: 'checklist';
  text: string;
  checked: boolean;
};

export type NoteBulletBlock = {
  id: string;
  type: 'bullet';
  text: string;
};

export type NoteDividerBlock = {
  id: string;
  type: 'divider';
};

export type NoteBlock =
  | NoteHeadingBlock
  | NoteParagraphBlock
  | NoteChecklistBlock
  | NoteBulletBlock
  | NoteDividerBlock;

export type NoteAttachment = {
  id: string;
  note_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  public_url: string;
};

export type NoteCategory = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  preview: string;
  plain_text: string;
  category_id: string | null;
  is_starred: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
};

export type NoteDetail = NoteSummary & {
  content: NoteBlock[];
  attachments: NoteAttachment[];
};

export type NotesListFilters = {
  q?: string;
  category_id?: string | null;
  starred?: boolean;
  trash?: boolean;
};
