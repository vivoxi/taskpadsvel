create extension if not exists pgcrypto;

create table if not exists public.note_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.note_categories
  add column if not exists name text,
  add column if not exists color text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  content jsonb not null default '[]'::jsonb,
  plain_text text not null default '',
  category_id uuid null references public.note_categories(id) on delete set null,
  is_starred boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.notes
  add column if not exists title text not null default 'Untitled',
  add column if not exists content jsonb not null default '[]'::jsonb,
  add column if not exists plain_text text not null default '',
  add column if not exists category_id uuid null references public.note_categories(id) on delete set null,
  add column if not exists is_starred boolean not null default false,
  add column if not exists deleted_at timestamptz null,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint null,
  mime_type text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.note_attachments
  add column if not exists note_id uuid references public.notes(id) on delete cascade,
  add column if not exists file_name text,
  add column if not exists file_path text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists notes_updated_idx on public.notes(updated_at desc);
create index if not exists notes_deleted_idx on public.notes(deleted_at);
create index if not exists notes_category_idx on public.notes(category_id);
create index if not exists notes_starred_idx on public.notes(is_starred);
create index if not exists note_attachments_note_idx on public.note_attachments(note_id);
create index if not exists note_categories_sort_idx on public.note_categories(sort_order);

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_notes_updated_at_trigger on public.notes;
create trigger set_notes_updated_at_trigger
before update on public.notes
for each row execute function public.set_notes_updated_at();

alter table public.notes enable row level security;
alter table public.note_categories enable row level security;
alter table public.note_attachments enable row level security;

revoke all on public.notes from anon, authenticated;
revoke all on public.note_categories from anon, authenticated;
revoke all on public.note_attachments from anon, authenticated;

drop policy if exists "deny all notes" on public.notes;
create policy "deny all notes"
on public.notes
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all note categories" on public.note_categories;
create policy "deny all note categories"
on public.note_categories
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all note attachments" on public.note_attachments;
create policy "deny all note attachments"
on public.note_attachments
for all
to anon, authenticated
using (false)
with check (false);
