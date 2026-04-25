# Taskpad Svelte

Short maintainer notes for future agents and contributors.

## Stack

- SvelteKit 2
- Svelte 5
- Tailwind 4
- Supabase

## Current Product Shape

- `/dashboard`: default calendar board for placing tasks across the planning month
- `/week`: weekly execution view with task completion, archive actions, and daily block notes
- `/planner`: recurring weekly/monthly template planning and schedule generation/reset actions
- `/notes`: categorized document notes with block editing and attachments
- `/one-time`: document-style one-time notes/tasks
- `/history`: completed, carried, and archived task history

Legacy route redirects are intentionally kept for old links:

- `/weekly` and `/thisweek` -> `/week`
- `/monthly`, `/random`, `/thismonth`, and `/month` -> `/planner`

## Data Model

- Recurring work starts in `task_templates`.
- Concrete work lives in `task_instances`.
- Daily week notes are stored in `weekly_notes`.
- General notes use `notes_documents`, `note_blocks`, `note_categories`, and note-linked `task_attachments`.
- Schedule blocks live in `schedule_blocks` and can be linked to task instances.

## API / Auth

- Browser code should mutate data through SvelteKit API routes, not directly through Supabase.
- Server code uses `SUPABASE_SERVICE_KEY` through `src/lib/server/supabase.ts`.
- Mutation routes should call `requireAuth(request)` before changing data.
- Client mutations attach `Authorization: Bearer ${password}` from the local password store when auth is enabled.

## Quality Bar

Before considering a change ready, run:

```sh
npm run check
npm test
npm run build
```

The repo should stay clean against all three commands.
