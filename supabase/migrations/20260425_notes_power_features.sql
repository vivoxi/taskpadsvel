-- Notes power features: smart folders, soft delete, pinning, ordering,
-- category color/icon metadata, richer block types, and attachment metadata.

alter table public.notes_documents
  add column if not exists starred boolean not null default false,
  add column if not exists deleted_at timestamptz default null,
  add column if not exists sort_order integer not null default 0,
  add column if not exists cover_image_url text default null,
  add column if not exists word_count integer not null default 0;

create index if not exists notes_documents_starred_idx
  on public.notes_documents (starred, updated_at desc)
  where deleted_at is null;

create index if not exists notes_documents_deleted_idx
  on public.notes_documents (deleted_at desc)
  where deleted_at is not null;

create index if not exists notes_documents_sort_idx
  on public.notes_documents (sort_order, updated_at desc);

alter table public.note_categories
  add column if not exists color text default '#6366f1',
  add column if not exists icon text default null,
  add column if not exists sort_order integer not null default 0;

alter table public.task_attachments
  add column if not exists file_size integer,
  add column if not exists public_url text;

alter table public.note_blocks drop constraint if exists note_blocks_type_check;
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

-- Optional Supabase Storage bucket for deployments that move notes uploads
-- from the local uploads directory to Storage.
insert into storage.buckets (id, name, public)
values ('note-attachments', 'note-attachments', true)
on conflict (id) do update set public = true;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'objects'
  ) then
    execute '
      create policy "Public read note attachments"
      on storage.objects for select
      using (bucket_id = ''note-attachments'')
    ';
  end if;
exception
  when duplicate_object then null;
end $$;
