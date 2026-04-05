# Supabase Notes

The rebuilt planner relies on a small, explicit schema:

- `task_templates`
- `task_instances`
- `weekly_notes`
- `notes_documents`
- `note_blocks`

## Migrations

Run these in order:

1. [migrations/20260406_rebuild_planner_core.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260406_rebuild_planner_core.sql)
2. [migrations/20260404_enable_rls_and_lock_public_tables.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql)

The application reads and writes through server endpoints only, using `SUPABASE_SERVICE_KEY`. Browser code should never access these tables directly.
