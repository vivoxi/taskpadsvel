alter table public.notes_documents
  add column if not exists kind text;

update public.notes_documents
set kind = 'note'
where kind is null;

alter table public.notes_documents
  alter column kind set default 'note';

alter table public.notes_documents
  alter column kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notes_documents_kind_check'
  ) then
    alter table public.notes_documents
      add constraint notes_documents_kind_check
      check (kind in ('note', 'one-time'));
  end if;
end $$;

create index if not exists notes_documents_kind_updated_idx
  on public.notes_documents (kind, updated_at desc);
