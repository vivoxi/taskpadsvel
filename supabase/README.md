# Supabase Notes

The rebuilt planner relies on a small, explicit schema:

- `task_templates`
- `task_instances`
- `weekly_notes`
- `notes`
- `note_categories`
- `note_attachments`

## Migrations

Run these in order:

1. [migrations/20260406_rebuild_planner_core.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260406_rebuild_planner_core.sql)
2. [migrations/20260404_enable_rls_and_lock_public_tables.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql)
3. [migrations/20260426_notes_v2.sql](/Users/mbtkimya/Documents/taskpad%20svelte%20v2/supabase/migrations/20260426_notes_v2.sql)

Notes v2 does not migrate old `notes_documents` or `note_blocks` data. The application reads and writes these tables through server endpoints only, using `SUPABASE_SERVICE_KEY`. Browser code should never access Notes v2 tables directly, and note attachments should be fetched through the auth-protected download endpoint.
