-- Bear-like notes additions for Taskpad's existing notes_documents model.
-- Compatibility mapping:
--   notes_documents.starred/category_id == requested notes.is_starred/folder_id

alter table public.notes_documents
  add column if not exists deleted_at timestamptz default null,
  add column if not exists starred boolean not null default false,
  add column if not exists is_starred boolean not null default false,
  add column if not exists color varchar(20),
  add column if not exists category_id uuid references public.note_categories(id) on delete set null,
  add column if not exists folder_id uuid references public.note_categories(id) on delete set null;

update public.notes_documents
set
  is_starred = coalesce(is_starred, starred, false),
  starred = coalesce(starred, is_starred, false),
  folder_id = coalesce(folder_id, category_id),
  category_id = coalesce(category_id, folder_id);

create or replace function public.sync_notes_document_aliases()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.starred := coalesce(new.starred, new.is_starred, false);
    new.is_starred := coalesce(new.is_starred, new.starred, false);
    new.category_id := coalesce(new.category_id, new.folder_id);
    new.folder_id := coalesce(new.folder_id, new.category_id);
  else
    if new.starred is distinct from old.starred and new.is_starred is not distinct from old.is_starred then
      new.is_starred := new.starred;
    elsif new.is_starred is distinct from old.is_starred and new.starred is not distinct from old.starred then
      new.starred := new.is_starred;
    end if;

    if new.category_id is distinct from old.category_id and new.folder_id is not distinct from old.folder_id then
      new.folder_id := new.category_id;
    elsif new.folder_id is distinct from old.folder_id and new.category_id is not distinct from old.category_id then
      new.category_id := new.folder_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_notes_document_aliases_trigger on public.notes_documents;
create trigger sync_notes_document_aliases_trigger
before insert or update on public.notes_documents
for each row execute function public.sync_notes_document_aliases();

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tags_user_name_idx
  on public.tags (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table if not exists public.note_tags (
  note_id uuid not null references public.notes_documents(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (note_id, tag_id)
);

create index if not exists note_tags_tag_idx on public.note_tags(tag_id);
create index if not exists note_tags_note_idx on public.note_tags(note_id);

create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes_documents(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists note_versions_note_created_idx
  on public.note_versions(note_id, created_at desc);

create index if not exists notes_documents_active_idx
  on public.notes_documents(updated_at desc)
  where deleted_at is null;

create index if not exists notes_documents_trash_idx
  on public.notes_documents(deleted_at desc)
  where deleted_at is not null;

create index if not exists notes_documents_folder_idx
  on public.notes_documents(category_id, updated_at desc)
  where deleted_at is null;

alter table public.tags enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_versions enable row level security;

grant select, insert, update, delete on public.notes_documents to authenticated;
grant select, insert, update, delete on public.note_blocks to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.note_tags to authenticated;
grant select, insert, update, delete on public.note_versions to authenticated;

drop policy if exists "deny all notes_documents" on public.notes_documents;
drop policy if exists "notes select active" on public.notes_documents;
create policy "notes select active"
on public.notes_documents
for select
to authenticated
using (deleted_at is null);

drop policy if exists "notes update active" on public.notes_documents;
create policy "notes update active"
on public.notes_documents
for update
to authenticated
using (deleted_at is null)
with check (true);

drop policy if exists "notes delete trashed" on public.notes_documents;
create policy "notes delete trashed"
on public.notes_documents
for delete
to authenticated
using (deleted_at is not null);

drop policy if exists "tags manage own" on public.tags;
create policy "tags manage own"
on public.tags
for all
to authenticated
using (user_id is null or auth.uid() = user_id)
with check (user_id is null or auth.uid() = user_id);

drop policy if exists "note tags manage active notes" on public.note_tags;
create policy "note tags manage active notes"
on public.note_tags
for all
to authenticated
using (
  exists (
    select 1 from public.notes_documents n
    where n.id = note_id and n.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.notes_documents n
    where n.id = note_id and n.deleted_at is null
  )
);

drop policy if exists "note versions manage active notes" on public.note_versions;
create policy "note versions manage active notes"
on public.note_versions
for all
to authenticated
using (
  exists (
    select 1 from public.notes_documents n
    where n.id = note_id and n.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.notes_documents n
    where n.id = note_id and n.deleted_at is null
  )
);

-- Optional pg_cron cleanup. Supabase projects that do not enable pg_cron
-- can run the DELETE manually or schedule it from the dashboard.
do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception
  when insufficient_privilege then null;
  when undefined_file then null;
  when invalid_schema_name then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) and not exists (
    select 1
    from cron.job
    where jobname = 'purge_deleted_notes_30d'
  ) then
    perform cron.schedule(
      'purge_deleted_notes_30d',
      '15 3 * * *',
      $job$
        delete from public.notes_documents
        where deleted_at is not null
          and deleted_at < now() - interval '30 days';
      $job$
    );
  end if;
exception
  when undefined_table then null;
  when insufficient_privilege then null;
end $$;

-- If a deployment also has a literal public.notes table, add the requested
-- columns there without affecting Taskpad's notes_documents implementation.
do $$
begin
  if to_regclass('public.notes') is not null then
    execute 'alter table public.notes add column if not exists deleted_at timestamptz default null';
    execute 'alter table public.notes add column if not exists is_starred boolean not null default false';
    execute 'alter table public.notes add column if not exists color varchar(20)';
    execute 'alter table public.notes add column if not exists folder_id uuid';
  end if;
end $$;
