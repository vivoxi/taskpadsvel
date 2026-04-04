-- Lock down public tables for anon/authenticated roles.
-- This migration records the RLS setup expected by the app after
-- moving browser reads/writes behind server endpoints.

alter table if exists public.tasks enable row level security;
alter table if exists public.weekly_plan enable row level security;
alter table if exists public.weekly_schedule enable row level security;
alter table if exists public.history_snapshots enable row level security;
alter table if exists public.task_attachments enable row level security;
alter table if exists public.reset_log enable row level security;
alter table if exists public.user_preferences enable row level security;

revoke all on table public.tasks from anon, authenticated;
revoke all on table public.weekly_plan from anon, authenticated;
revoke all on table public.weekly_schedule from anon, authenticated;
revoke all on table public.history_snapshots from anon, authenticated;
revoke all on table public.task_attachments from anon, authenticated;
revoke all on table public.reset_log from anon, authenticated;
revoke all on table public.user_preferences from anon, authenticated;

drop policy if exists "deny all tasks" on public.tasks;
create policy "deny all tasks"
on public.tasks
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all weekly_plan" on public.weekly_plan;
create policy "deny all weekly_plan"
on public.weekly_plan
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all weekly_schedule" on public.weekly_schedule;
create policy "deny all weekly_schedule"
on public.weekly_schedule
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all history_snapshots" on public.history_snapshots;
create policy "deny all history_snapshots"
on public.history_snapshots
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

drop policy if exists "deny all reset_log" on public.reset_log;
create policy "deny all reset_log"
on public.reset_log
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny all user_preferences" on public.user_preferences;
create policy "deny all user_preferences"
on public.user_preferences
for all
to anon, authenticated
using (false)
with check (false);
