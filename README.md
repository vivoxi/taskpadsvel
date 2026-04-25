# Taskpad Svelte

Taskpad Svelte is a focused personal planning app rebuilt around four primary surfaces:

- `Dashboard`: the default calendar workspace
- `Week`: weekly execution plus daily notes
- `Planner`: month-level recurring work and scheduling
- `Notes`: a simple server-backed notes surface with folders, attachments, and soft delete

## Stack

- SvelteKit 2
- Svelte 5
- Tailwind 4
- Supabase

## Main Pages

- `/dashboard`: default calendar board with drag-and-drop task placement
- `/week`: weekly execution plus editable daily notes
- `/planner`: recurring weekly/monthly planning for the selected month
- `/notes`: Notes v2 with simple blocks, folders, trash, and auth-gated attachments
- `/one-time`: document-style one-time notes/tasks
- `/history`: completed, carried, and archived task history

Legacy routes redirect to the current surfaces:

- `/weekly` and `/thisweek` redirect to `/week`
- `/monthly`, `/random`, `/thismonth`, and `/month` redirect to `/planner`

## Key Behaviors

- The app opens into the dashboard calendar workspace.
- Past weeks stay editable. There is no snapshot or archive mode.
- Recurring work is modeled through `task_templates` and concrete `task_instances`.
- Weekly notes are block-based per weekday and can be edited on any week.
- General notes use Notes v2: server-only Supabase access, simple JSON blocks, category folders, and disk-backed attachments behind auth.

## Development

```sh
npm install
npm run dev
```

## Quality Checks

```sh
npm run check
npm test
npm run build
```

## Environment

Copy `.env.example` to `.env` and fill the required values.

Required app values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_PASSWORD`

## Supabase Notes

Apply the planner schema migration first, then the lock-down migration and later feature migrations in timestamp order. Notes v2 uses its own tables and does not migrate old `notes_documents` data.

- `supabase/migrations/20260406_rebuild_planner_core.sql`
- `supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql`
- `supabase/migrations/20260407b_normalize_legacy_task_attachments.sql`
- `supabase/migrations/20260407c_add_notes_document_kinds.sql`
- `supabase/migrations/20260407_operations_planner_phase1.sql`
- `supabase/migrations/20260424_note_categories_and_image_blocks.sql`
- `supabase/migrations/20260426_notes_v2.sql`

The rebuilt app uses these tables:

- `task_templates`
- `task_instances`
- `weekly_notes`
- `note_categories`
- `notes`
- `note_attachments`

`/notes` talks to Supabase only through SvelteKit server endpoints using `SUPABASE_SERVICE_KEY`. Browser code does not query notes tables directly, and Notes v2 attachments are downloaded through auth-protected API routes instead of public upload URLs.
