# Taskpad Svelte

Taskpad Svelte is a SvelteKit planner for recurring weekly/monthly work, categorized random tasks, and generated weekly schedules.

## Stack

- SvelteKit 2
- Svelte 5
- Tailwind 4
- TanStack Query
- Supabase

## Main Pages

- `/dashboard`: completion metrics and archive summaries
- `/weekly`: recurring weekly tasks
- `/monthly`: recurring monthly tasks and month archive
- `/random`: categorized free-form task board
- `/thisweek`: planner notes, generated schedule, and week archive

## Key Behaviors

- Weekly tasks reset at the start of a new week.
- Monthly tasks reset at the start of a new month.
- A snapshot is captured before reset so completed vs missed work stays visible in archives.
- Generated schedule blocks can sync completion and attachments with linked weekly/monthly tasks.
- Schedule generation supports both rule-based mode and AI mode.
- Work hours are fixed at `10:00-17:00` with a break at `13:00-14:00`.

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

Optional AI values:

- `AI_PROVIDER=anthropic`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `AI_PROVIDER=openai-compatible`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_URL`

## Supabase Notes

This repo does not currently ship Supabase migrations. The following tables are expected to exist in your project:

- `tasks`
- `weekly_plan`
- `weekly_schedule`
- `history_snapshots`
- `task_attachments`
- `reset_log`
- `user_preferences`

`user_preferences` is used for task ordering and random category preferences. If you are setting up a fresh Supabase project, create that table manually or add your own migration before running the app.

## Dokploy Deployment

This repo is ready to deploy on Dokploy with the `Dockerfile` build type.

Recommended Dokploy settings:

- Build Type: `Dockerfile`
- Dockerfile Path: `Dockerfile`
- Docker Context Path: `.`
- Port: `3000`
- Persistent Volume: mount a volume to `/app/uploads`
- Health Check URL: `/api/health`

Build-time arguments:

- `PUBLIC_AUTH_REQUIRED` (optional, defaults to `false`)

Runtime environment variables required in Dokploy:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_PASSWORD`
- `UPLOADS_DIR=/app/uploads`

Optional runtime AI variables:

- `AI_PROVIDER`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_URL`

If you use Dokploy rollback or health checks, point them to `http://localhost:3000/api/health`.
