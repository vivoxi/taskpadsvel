import { error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPublicUploadPath } from '$lib/server/uploads';
import { buildPlainText, buildPreview } from '$lib/notes-v2/validation';
import type {
  NoteAttachment,
  NoteBlock,
  NoteCategory,
  NoteDetail,
  NoteSummary,
  NotesListFilters
} from '$lib/notes-v2/types';

type NoteRow = {
  id: string;
  title: string;
  content: unknown;
  plain_text: string;
  category_id: string | null;
  is_starred: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  note_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

function assertArrayContent(value: unknown): NoteBlock[] {
  return Array.isArray(value) ? (value as NoteBlock[]) : [];
}

function toSummary(row: NoteRow, attachmentCount = 0): NoteSummary {
  const content = assertArrayContent(row.content);
  return {
    id: row.id,
    title: row.title,
    preview: buildPreview(row.title, content),
    plain_text: row.plain_text,
    category_id: row.category_id,
    is_starred: row.is_starred,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    attachment_count: attachmentCount
  };
}

function toAttachment(row: AttachmentRow): NoteAttachment {
  return {
    ...row,
    public_url: getPublicUploadPath(row.file_path)
  };
}

export async function listNoteCategories(): Promise<NoteCategory[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('note_categories')
    .select('id, name, color, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (queryError) throw error(500, queryError.message);
  return (data ?? []) as NoteCategory[];
}

export async function listNotes(filters: NotesListFilters = {}): Promise<NoteSummary[]> {
  let query = supabaseAdmin
    .from('notes')
    .select('id, title, content, plain_text, category_id, is_starred, deleted_at, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (filters.trash) {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  if (filters.category_id) {
    query = query.eq('category_id', filters.category_id);
  }

  if (filters.starred) {
    query = query.eq('is_starred', true);
  }

  if (filters.q?.trim()) {
    const escaped = filters.q.trim().replace(/[%_]/g, '\\$&');
    query = query.ilike('plain_text', `%${escaped}%`);
  }

  const { data, error: queryError } = await query;
  if (queryError) throw error(500, queryError.message);

  const rows = (data ?? []) as NoteRow[];
  const noteIds = rows.map((row) => row.id);
  let counts = new Map<string, number>();

  if (noteIds.length > 0) {
    const { data: attachments, error: attachmentError } = await supabaseAdmin
      .from('note_attachments')
      .select('note_id')
      .in('note_id', noteIds);

    if (attachmentError) throw error(500, attachmentError.message);

    counts = (attachments ?? []).reduce((map, row) => {
      const key = String(row.note_id);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  return rows.map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export async function getNoteDetail(noteId: string): Promise<NoteDetail | null> {
  const { data, error: noteError } = await supabaseAdmin
    .from('notes')
    .select('id, title, content, plain_text, category_id, is_starred, deleted_at, created_at, updated_at')
    .eq('id', noteId)
    .maybeSingle();

  if (noteError) throw error(500, noteError.message);
  if (!data) return null;

  const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
    .from('note_attachments')
    .select('id, note_id, file_name, file_path, file_size, mime_type, created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: false });

  if (attachmentError) throw error(500, attachmentError.message);

  return {
    ...toSummary(data as NoteRow, attachmentRows?.length ?? 0),
    content: assertArrayContent((data as NoteRow).content),
    attachments: ((attachmentRows ?? []) as AttachmentRow[]).map(toAttachment)
  };
}

export async function createNoteRow(input: {
  title: string;
  content: NoteBlock[];
  category_id: string | null;
}): Promise<NoteDetail> {
  const plainText = buildPlainText(input.title, input.content);
  const { data, error: insertError } = await supabaseAdmin
    .from('notes')
    .insert({
      title: input.title,
      content: input.content,
      plain_text: plainText,
      category_id: input.category_id
    })
    .select('id, title, content, plain_text, category_id, is_starred, deleted_at, created_at, updated_at')
    .single();

  if (insertError) throw error(500, insertError.message);

  return {
    ...toSummary(data as NoteRow, 0),
    content: assertArrayContent((data as NoteRow).content),
    attachments: []
  };
}

export async function updateNoteRow(
  noteId: string,
  patch: {
    title?: string;
    content?: NoteBlock[];
    category_id?: string | null;
    is_starred?: boolean;
    deleted_at?: string | null;
  }
): Promise<NoteDetail | null> {
  const current = await getNoteDetail(noteId);
  if (!current) return null;

  const title = patch.title ?? current.title;
  const content = patch.content ?? current.content;
  const plainText = buildPlainText(title, content);

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if ('title' in patch) payload.title = title;
  if ('content' in patch) {
    payload.content = content;
    payload.plain_text = plainText;
  } else if ('title' in patch) {
    payload.plain_text = plainText;
  }
  if ('category_id' in patch) payload.category_id = patch.category_id;
  if ('is_starred' in patch) payload.is_starred = patch.is_starred;
  if ('deleted_at' in patch) payload.deleted_at = patch.deleted_at;

  const { error: updateError } = await supabaseAdmin.from('notes').update(payload).eq('id', noteId);
  if (updateError) throw error(500, updateError.message);

  return getNoteDetail(noteId);
}

export async function deleteNoteRow(noteId: string, permanent: boolean): Promise<boolean> {
  if (permanent) {
    const { error: deleteError } = await supabaseAdmin.from('notes').delete().eq('id', noteId);
    if (deleteError) throw error(500, deleteError.message);
    return true;
  }

  const updated = await updateNoteRow(noteId, { deleted_at: new Date().toISOString() });
  return Boolean(updated);
}

export async function createCategoryRow(input: {
  name: string;
  color: string | null;
  sort_order?: number;
}): Promise<NoteCategory> {
  const sortOrder =
    input.sort_order ??
    (await supabaseAdmin
      .from('note_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .then(({ data }) => ((data?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1));

  const { data, error: insertError } = await supabaseAdmin
    .from('note_categories')
    .insert({ name: input.name, color: input.color, sort_order: sortOrder })
    .select('id, name, color, sort_order, created_at')
    .single();

  if (insertError) throw error(500, insertError.message);
  return data as NoteCategory;
}

export async function updateCategoryRow(
  categoryId: string,
  patch: { name?: string; color?: string | null; sort_order?: number }
): Promise<NoteCategory | null> {
  const payload: Record<string, unknown> = {};
  if ('name' in patch) payload.name = patch.name;
  if ('color' in patch) payload.color = patch.color;
  if ('sort_order' in patch) payload.sort_order = patch.sort_order;

  const { data, error: updateError } = await supabaseAdmin
    .from('note_categories')
    .update(payload)
    .eq('id', categoryId)
    .select('id, name, color, sort_order, created_at')
    .maybeSingle();

  if (updateError) throw error(500, updateError.message);
  return (data as NoteCategory | null) ?? null;
}

export async function deleteCategoryRow(categoryId: string): Promise<void> {
  const { error: noteError } = await supabaseAdmin
    .from('notes')
    .update({ category_id: null, updated_at: new Date().toISOString() })
    .eq('category_id', categoryId);

  if (noteError) throw error(500, noteError.message);

  const { error: categoryError } = await supabaseAdmin.from('note_categories').delete().eq('id', categoryId);
  if (categoryError) throw error(500, categoryError.message);
}
