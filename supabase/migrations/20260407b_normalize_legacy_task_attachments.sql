create extension if not exists pgcrypto;

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid references public.task_instances(id) on delete cascade,
  note_document_id uuid references public.notes_documents(id) on delete cascade,
  file_name text,
  file_path text,
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
