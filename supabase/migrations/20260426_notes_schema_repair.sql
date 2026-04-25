-- Idempotent Notes schema repair for the current Svelte Notes UI/API.
-- Keeps the database constraint aligned with src/lib/planner/types.ts and
-- src/lib/planner/blocks.ts.

create table if not exists public.note_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.note_categories(id) on delete set null,
  color text default '#6366f1',
  icon text default null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.note_categories
  add column if not exists name text,
  add column if not exists parent_id uuid references public.note_categories(id) on delete set null,
  add column if not exists color text default '#6366f1',
  add column if not exists icon text default null,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.notes_documents
  add column if not exists kind text default 'note',
  add column if not exists category_id uuid references public.note_categories(id) on delete set null,
  add column if not exists deleted_at timestamptz default null,
  add column if not exists starred boolean not null default false,
  add column if not exists color varchar(20),
  add column if not exists sort_order integer not null default 0,
  add column if not exists cover_image_url text default null,
  add column if not exists word_count integer not null default 0,
  add column if not exists preview text default '',
  add column if not exists attachment_count integer not null default 0,
  add column if not exists first_image_url text default null;

update public.notes_documents
set kind = 'note'
where kind is null;

alter table public.notes_documents
  alter column kind set default 'note';

alter table public.notes_documents
  drop constraint if exists notes_documents_kind_check;

alter table public.notes_documents
  add constraint notes_documents_kind_check
  check (kind in ('note', 'one-time'));

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid,
  note_document_id uuid references public.notes_documents(id) on delete cascade,
  file_name text not null default 'attachment',
  file_path text not null default '',
  file_size integer,
  mime_type text,
  public_url text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.task_attachments
  add column if not exists task_instance_id uuid,
  add column if not exists note_document_id uuid references public.notes_documents(id) on delete cascade,
  add column if not exists file_name text not null default 'attachment',
  add column if not exists file_path text not null default '',
  add column if not exists file_size integer,
  add column if not exists mime_type text,
  add column if not exists public_url text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.note_blocks
  drop constraint if exists note_blocks_type_check;

alter table public.note_blocks
  add constraint note_blocks_type_check
  check (
    type in (
      'heading',
      'heading1',
      'heading2',
      'heading3',
      'paragraph',
      'checklist',
      'todo',
      'bullet_list',
      'numbered_list',
      'code',
      'quote',
      'divider',
      'image',
      'file'
    )
  );

create index if not exists note_blocks_document_sort_idx
  on public.note_blocks(document_id, sort_order);

create index if not exists notes_documents_kind_updated_idx
  on public.notes_documents(kind, updated_at desc);

create index if not exists notes_documents_category_idx
  on public.notes_documents(category_id);

create index if not exists notes_documents_deleted_idx
  on public.notes_documents(deleted_at desc)
  where deleted_at is not null;

create index if not exists task_attachments_note_document_idx
  on public.task_attachments(note_document_id);

create index if not exists task_attachments_name_idx
  on public.task_attachments(file_name);

analyze public.notes_documents;
analyze public.note_blocks;
analyze public.task_attachments;
