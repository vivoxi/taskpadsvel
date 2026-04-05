create extension if not exists pgcrypto;

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('weekly', 'monthly')),
  active boolean not null default true,
  estimate_hours numeric(6, 2),
  preferred_day text check (
    preferred_day is null or preferred_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  preferred_week_of_month integer check (
    preferred_week_of_month is null or preferred_week_of_month between 1 and 6
  ),
  sort_order integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  title_snapshot text not null,
  instance_kind text not null check (instance_kind in ('weekly', 'monthly')),
  week_key text,
  month_key text,
  week_of_month integer,
  day_name text check (
    day_name is null or day_name in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  sort_order integer,
  source_context jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists task_instances_weekly_unique
  on public.task_instances(template_id, month_key, week_key, instance_kind)
  where instance_kind = 'weekly';

create unique index if not exists task_instances_monthly_unique
  on public.task_instances(template_id, month_key, instance_kind)
  where instance_kind = 'monthly';

create index if not exists task_instances_week_key_idx on public.task_instances(week_key);
create index if not exists task_instances_month_key_idx on public.task_instances(month_key);

create table if not exists public.weekly_notes (
  id uuid primary key default gen_random_uuid(),
  week_key text not null,
  day_name text not null check (day_name in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  blocks_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (week_key, day_name)
);

create table if not exists public.notes_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.note_blocks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.notes_documents(id) on delete cascade,
  type text not null check (type in ('heading', 'paragraph', 'checklist')),
  text text not null default '',
  checked boolean,
  level integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists note_blocks_document_sort_idx on public.note_blocks(document_id, sort_order);

alter table if exists public.task_templates enable row level security;
alter table if exists public.task_instances enable row level security;
alter table if exists public.weekly_notes enable row level security;
alter table if exists public.notes_documents enable row level security;
alter table if exists public.note_blocks enable row level security;

revoke all on table public.task_templates from anon, authenticated;
revoke all on table public.task_instances from anon, authenticated;
revoke all on table public.weekly_notes from anon, authenticated;
revoke all on table public.notes_documents from anon, authenticated;
revoke all on table public.note_blocks from anon, authenticated;

drop policy if exists "deny all task_templates" on public.task_templates;
create policy "deny all task_templates"
on public.task_templates
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all task_instances" on public.task_instances;
create policy "deny all task_instances"
on public.task_instances
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all weekly_notes" on public.weekly_notes;
create policy "deny all weekly_notes"
on public.weekly_notes
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all notes_documents" on public.notes_documents;
create policy "deny all notes_documents"
on public.notes_documents
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all note_blocks" on public.note_blocks;
create policy "deny all note_blocks"
on public.note_blocks
for all
to anon, authenticated
using (false)
with check (false);
