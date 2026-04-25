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
- `/notes`: categorized document notes with block editing and attachments (Notes v2)
- `/one-time`: legacy document-style one-time notes/tasks (see Legacy below)
- `/history`: completed, carried, and archived task history

Legacy route redirects are intentionally kept for old links:

- `/weekly` and `/thisweek` -> `/week`
- `/monthly`, `/random`, `/thismonth`, and `/month` -> `/planner`

## Data Model

- Recurring work starts in `task_templates`.
- Concrete work lives in `task_instances`.
- Daily week notes are stored in `weekly_notes`.
- Schedule blocks live in `schedule_blocks` and can be linked to task instances.

### Notes v2 (active)

- `notes` — note rows with title, content blocks (JSONB), category, star, soft-delete
- `note_categories` — folder/category rows with name and color
- `note_attachments` — files attached to notes; served via `/api/notes/[noteId]/attachments/[id]/download`

### Legacy tables (do not use for new features)

- `notes_documents` — old document model, used by `/one-time` only
- `note_blocks` — old per-row block model superseded by JSONB content in `notes`
- `note_tags` — old tag model, no active UI
- `task_attachments` — old attachment model linked to task instances, superseded by `note_attachments`

## Legacy: /one-time

`/one-time` is a legacy route backed by `notes_documents` and the old `PlannerBlock` model. It has not been migrated to Notes v2.

TODO: Migrate `/one-time` to Notes v2 (`notes` + `note_attachments`) or retire the route. Until then, do not build new features on top of it.

## API / Auth

- Browser code should mutate data through SvelteKit API routes, not directly through Supabase.
- Server code uses `SUPABASE_SERVICE_KEY` through `src/lib/server/supabase.ts`.
- Mutation routes (and GET routes that expose private data) must call `requireAuth(request)` before accessing data.
- Page `load` functions must call `canReadPage({ request, authRequired })` and return `{ locked: true }` with empty data when auth fails. See `src/routes/notes/+page.server.ts` for the canonical pattern.
- Client mutations attach `Authorization: Bearer ${password}` from the local password store when auth is enabled.

## Quality Bar

Before considering a change ready, run:

```sh
npm run check
npm test
npm run build
```

The repo should stay clean against all three commands.
