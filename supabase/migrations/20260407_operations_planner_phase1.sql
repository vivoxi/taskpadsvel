alter table if exists public.task_templates
  add column if not exists priority_default text not null default 'medium'
    check (priority_default in ('high', 'medium', 'low')),
  add column if not exists hours_needed_default numeric(6, 2),
  add column if not exists category text,
  add column if not exists source_type_default text not null default 'weekly'
    check (source_type_default in ('weekly', 'monthly', 'inbox')),
  add column if not exists due_day_offset integer;

alter table if exists public.task_instances
  alter column template_id drop not null;

alter table if exists public.task_instances
  add column if not exists priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  add column if not exists due_date date,
  add column if not exists hours_needed numeric(6, 2),
  add column if not exists category text,
  add column if not exists source_type text not null default 'weekly'
    check (source_type in ('weekly', 'monthly', 'inbox')),
  add column if not exists preferred_day text
    check (
      preferred_day is null
      or preferred_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
    ),
  add column if not exists preferred_week integer
    check (preferred_week is null or preferred_week between 1 and 6),
  add column if not exists carried_from_instance_id uuid references public.task_instances(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists linked_schedule_block_id uuid;

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_date date,
  hours_needed numeric(6, 2),
  category text,
  preferred_day text check (
    preferred_day is null or preferred_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  preferred_week integer check (preferred_week is null or preferred_week between 1 and 6),
  source_type text not null default 'inbox' check (source_type = 'inbox'),
  promoted_to_instance_id uuid references public.task_instances(id) on delete set null,
  promoted_to_template_id uuid references public.task_templates(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists inbox_items_updated_at_idx on public.inbox_items(updated_at desc);

create table if not exists public.planner_settings (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Primary schedule',
  working_day_start text not null default '10:00',
  working_day_end text not null default '17:00',
  break_start text not null default '13:00',
  break_end text not null default '14:00',
  buffer_minutes integer not null default 0,
  theme_mode text not null default 'system' check (theme_mode in ('system', 'light', 'dark')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid references public.task_instances(id) on delete set null,
  week_key text,
  month_key text,
  day_name text check (
    day_name is null or day_name in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  scheduled_for date not null,
  starts_at time not null,
  ends_at time not null,
  duration_hours numeric(6, 2) not null default 1,
  locked boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  source_type text not null default 'weekly' check (source_type in ('weekly', 'monthly', 'inbox')),
  title_snapshot text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists schedule_blocks_month_day_idx
  on public.schedule_blocks(month_key, scheduled_for, starts_at);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid references public.task_instances(id) on delete cascade,
  note_document_id uuid references public.notes_documents(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.task_attachments
  add column if not exists task_instance_id uuid references public.task_instances(id) on delete cascade,
  add column if not exists note_document_id uuid references public.notes_documents(id) on delete cascade,
  add column if not exists file_name text,
  add column if not exists file_path text,
  add column if not exists mime_type text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists task_attachments_name_idx on public.task_attachments(file_name);

alter table if exists public.inbox_items enable row level security;
alter table if exists public.planner_settings enable row level security;
alter table if exists public.schedule_blocks enable row level security;
alter table if exists public.task_attachments enable row level security;

revoke all on table public.inbox_items from anon, authenticated;
revoke all on table public.planner_settings from anon, authenticated;
revoke all on table public.schedule_blocks from anon, authenticated;
revoke all on table public.task_attachments from anon, authenticated;

drop policy if exists "deny all inbox_items" on public.inbox_items;
create policy "deny all inbox_items"
on public.inbox_items
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all planner_settings" on public.planner_settings;
create policy "deny all planner_settings"
on public.planner_settings
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all schedule_blocks" on public.schedule_blocks;
create policy "deny all schedule_blocks"
on public.schedule_blocks
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all task_attachments" on public.task_attachments;
create policy "deny all task_attachments"
on public.task_attachments
for all
to anon, authenticated
using (false)
with check (false);
