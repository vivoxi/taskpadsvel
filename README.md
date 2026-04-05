# Taskpad Svelte

Taskpad Svelte is a focused personal planning app rebuilt around three surfaces only:

- `Week`: the default home and execution workspace
- `Month`: a calm planning studio for recurring work
- `Notes`: a lightweight block-based writing space

## Stack

- SvelteKit 2
- Svelte 5
- Tailwind 4
- Supabase

## Main Pages

- `/week`: weekly execution plus editable daily notes
- `/month`: recurring weekly/monthly planning for the selected month
- `/notes`: document-style notes with headings, paragraphs, and checklists

## Key Behaviors

- The app always opens into the weekly workspace.
- Past weeks stay editable. There is no snapshot or archive mode.
- Recurring work is modeled through `task_templates` and concrete `task_instances`.
- Weekly notes are block-based per weekday and can be edited on any week.
- General notes use a simple document + block model instead of a rich text editor.

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

Apply the planner schema migration first, then the lock-down migration.

- [supabase/migrations/20260406_rebuild_planner_core.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260406_rebuild_planner_core.sql)
- [supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql](/Users/mbtkimya/Documents/taskpad%20svelte/supabase/migrations/20260404_enable_rls_and_lock_public_tables.sql)

The rebuilt app uses these tables:

- `task_templates`
- `task_instances`
- `weekly_notes`
- `notes_documents`
- `note_blocks`

That setup assumes the app talks to Supabase through server endpoints using `SUPABASE_SERVICE_KEY`, not from the browser.
