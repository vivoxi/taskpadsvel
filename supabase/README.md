# Supabase Schema Guide

The current app is built around:

- `task_templates`
- `task_instances`
- `weekly_notes`
- `schedule_blocks`
- `notes`
- `note_categories`
- `note_attachments`

Important model notes:

- `task_instances.template_id` is nullable in the current model. Inbox/manual tasks intentionally exist without a template.
- Notes v2 uses `notes`, not `notes_documents`.
- Notes v2 attachments use `note_attachments`.
- `task_attachments` is retained only for task attachments and legacy note-document compatibility work.
- Legacy `notes_documents`, `note_blocks`, and `task_attachments.note_document_id` should not be used for new features.

## Fresh Install Order

For a new environment, apply migrations in this order:

1. `20260406_rebuild_planner_core.sql`
2. `20260404_enable_rls_and_lock_public_tables.sql`
3. `20260426_notes_v2.sql`

## Legacy Compatibility Order

If you need legacy document compatibility before migration/export cleanup, apply the newer compatibility migrations afterward in timestamp order:

1. `20260407b_normalize_legacy_task_attachments.sql`
2. `20260407c_add_notes_document_kinds.sql`
3. `20260407_operations_planner_phase1.sql`
4. `20260424_note_categories_and_image_blocks.sql`
5. `20260425_notes_power_features.sql`
6. `20260425_notes_tags_versions_trash.sql`
7. `20260426_notes_schema_repair.sql`

## Notes

Notes v2 does not migrate old `notes_documents` or `note_blocks` data automatically. The application reads and writes Notes v2 through server endpoints only, using `SUPABASE_SERVICE_KEY`. Browser code should not access notes tables directly, and note attachments should be fetched through the auth-protected download endpoint.
