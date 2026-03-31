# TaskpadSvel — Design Spec
**Date:** 2026-03-31

---

## Overview

Single-user personal productivity web app. No authentication required by default; optional write-protection via `ADMIN_PASSWORD` env var. Deployed via Docker on a VPS (Dokploy). SvelteKit with TypeScript throughout.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit (latest) + TypeScript |
| Styling | TailwindCSS v4 + shadcn-svelte (zinc palette, Geist font) |
| Database | Supabase (`@supabase/supabase-js`) — PostgreSQL, client-side queries |
| Server state | TanStack Query for Svelte (`@tanstack/svelte-query`) |
| Date/week math | date-fns (single source of truth via `weekUtils.ts`) |
| Drag & drop | svelte-dnd-action |
| Toasts | Svelte Sonner |
| Icons | Lucide Svelte |
| Client state | Svelte stores (`activeView`, `weekOffset`, `generatedWeeks`, `authPassword`) |
| AI (server only) | `@anthropic-ai/sdk` — Claude claude-sonnet-4-6 |

---

## Database Schema

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('weekly','monthly','random')),
  completed boolean default false,
  notes text default '',
  created_at timestamptz default now()
);

create table task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  filename text not null,
  original_name text,
  mime_type text,
  url text,
  week_key text,
  created_at timestamptz default now()
);

create table weekly_plan (
  id uuid primary key default gen_random_uuid(),
  week_key text not null,
  day text not null,
  content text default '',
  unique(week_key, day)
);

create table weekly_schedule (
  id uuid primary key default gen_random_uuid(),
  week_key text not null,
  day text not null,
  start_time text not null,
  end_time text not null,
  task_title text not null,
  notes text default '',
  sort_order integer default 0
);

create table reset_log (
  type text primary key,
  last_reset_key text not null
);

create table history_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly','monthly')),
  period_key text not null,
  period_label text not null,
  completed_tasks jsonb default '[]',
  missed_tasks jsonb default '[]',
  planner_notes jsonb default '{}',
  completion_rate float default 0,
  created_at timestamptz default now(),
  unique(period_type, period_key)
);
```

---

## Week / Date Utilities (`src/lib/weekUtils.ts`)

Single source of truth for all week and date math. Import everywhere — never inline date logic.

| Export | Signature | Description |
|---|---|---|
| `getWeekKey` | `(date?: Date) => string` | `"2025-W14"` using ISO week (date-fns `getISOWeek` + `getISOWeekYear`) |
| `getMonthKey` | `(date?: Date) => string` | `"2025-M04"` |
| `getWeekDays` | `(weekKey: string) => Date[7]` | Mon–Sun for the given ISO week |
| `weekLabel` | `(weekKey: string) => string` | `"Apr 1–7, 2025"` |
| `monthLabel` | `(monthKey: string) => string` | `"April 2025"` |
| `DAY_NAMES` | `string[7]` | `['Monday', ..., 'Sunday']` |

---

## Client State (Svelte Stores)

| Store | Type | Purpose |
|---|---|---|
| `activeView` | `'weekly' \| 'monthly' \| 'random' \| 'thisweek'` | Which sidebar tab is active |
| `weekOffset` | `number` | Integer offset from current week (0 = current, -1 = last week, etc.) |
| `generatedWeeks` | `Writable<Set<string>>` | Week keys that have already triggered auto-schedule generation this session — prevents duplicate API calls on re-render or navigation. Update via `generatedWeeks.update(s => new Set([...s, weekKey]))` to preserve reactivity. |
| `authPassword` | `string` | Entered password stored in memory; attached as `Authorization: Bearer` header on all mutating requests |

---

## Views

### Sidebar (4 items)
1. Weekly Tasks
2. Monthly Tasks
3. Random Tasks
4. This Week

---

### Views 1–3: Task Lists (Weekly / Monthly / Random)

**Layout:**
- Progress bar (shadcn-svelte `Progress`) at top showing completion %
- Inline "Add task" input at bottom (Enter to submit)
- Tasks sorted: incomplete first, then complete

**Each task row:**
- Notion-style circular toggle checkbox
- Title text
- Expandable via shadcn-svelte `Accordion`:
  - Notes textarea — debounced auto-save (500ms)
  - File attachments section: paperclip button → hidden `<input type="file">` → `POST /api/upload` → display image thumbnail or filename chip; hover shows delete button → `DELETE /api/upload/[id]`

**Reset behavior:**

| View | Reset trigger | Snapshot? |
|---|---|---|
| Weekly | On mount: check `reset_log` for `type='weekly'`; if `last_reset_key !== currentWeekKey` → reset | Yes — `takeSnapshot('weekly')` before reset |
| Monthly | On mount: check `reset_log` for `type='monthly'`; if `last_reset_key !== currentMonthKey` → reset | Yes — `takeSnapshot('monthly')` before reset |
| Random | Manual "Reset all" button only | No |

**Reset sequence (Weekly/Monthly):**
1. `await takeSnapshot(type)` — write to `history_snapshots` (upsert):
   - `completed_tasks`: tasks where `completed = true` for this type
   - `missed_tasks`: tasks where `completed = false` for this type
   - `planner_notes`: weekly only — all `weekly_plan` rows for current week key as `{ day: content }` map; monthly snapshots always write `{}`
   - `completion_rate`: `completed / total` (0 if no tasks)
   - `period_label`: `weekLabel(weekKey)` or `monthLabel(monthKey)`
2. `UPDATE tasks SET completed = false WHERE type = <type>`
3. `UPDATE reset_log SET last_reset_key = <currentKey> WHERE type = <type>`
4. Show success toast

---

### View 4: This Week

**Week navigation header:**
- `←` prev week / `→` next week arrows
- Center: `weekLabel(currentWeekKey)`
- "This Week" button resets `weekOffset` to 0

**Derived state:**
```
currentWeekKey = getWeekKey(addWeeks(today, weekOffset))
isPastWeek = weekOffset < 0
```

---

#### Current / Future Week (`weekOffset >= 0`)

**Two-column layout:**
- Left 40%: **Daily Planner**
  - 7 `DayCard` components (Mon–Sun)
  - Each: day name + date label, `<textarea>` for free-form notes
  - Debounced save (500ms) → upsert into `weekly_plan`
  - Today's card: blue accent border
- Right 60%: **AI Schedule**
  - Time-block cards grouped by day
  - Each block: `start_time–end_time`, `task_title`, `notes`
  - Inline editable: click any field → input/textarea appears, save on blur or Enter
  - Draggable within day (svelte-dnd-action) → updates `sort_order`
  - **Auto-generate:** after task data loads, if `weekly_schedule` is empty for this `weekKey` AND `weekKey` not in `generatedWeeks` → call `POST /api/schedule/generate`, add to `generatedWeeks`
  - **"Regenerate" button:** always visible; calls `POST /api/schedule/generate` regardless of `generatedWeeks`

---

#### Past Week (`weekOffset < 0`)

Same layout, same components, but:
- **"Archived Week — Read Only" banner** at top of page
- Data sources:
  - Tasks: `history_snapshots` for this `week_key` (completed + missed merged into a single read-only list, completed ones shown with checkmark). If no snapshot exists for this week key, show an empty state: "No snapshot available for this week."
  - Planner notes: `history_snapshots.planner_notes` (day → text map, read-only). Falls back to empty strings per day if snapshot missing.
  - Schedule: `weekly_schedule` table (rows still present, read-only). Shows empty state if no rows exist.
- All edit controls disabled or hidden:
  - Planner textareas: `disabled`
  - Schedule inline edit: click does nothing
  - Schedule drag: disabled
  - Regenerate button: hidden
  - Add task: hidden

---

## API Routes (`src/routes/api/`)

### Auth Middleware (`src/lib/server/auth.ts`)

```ts
// Called at the top of every non-GET +server.ts handler
export function requireAuth(request: Request): Response | null
```

- If `ADMIN_PASSWORD` env var is not set → returns `null` (no auth required)
- If set → checks `Authorization: Bearer <password>` header
- Returns `Response` with status `401` on failure, `null` on success
- Callers: `const authError = requireAuth(request); if (authError) return authError;`

---

### `POST /api/upload`

- Reads `FormData`: `file` (Blob), `taskId` (string), `weekKey` (string)
- Generates UUID filename, preserves extension
- Writes to `/app/uploads/{weekKey}/{uuid}.ext`
- Inserts row into `task_attachments`
- Returns: `{ id, task_id, filename, original_name, mime_type, url: '/uploads/{weekKey}/{uuid}.ext', week_key }`

### `DELETE /api/upload/[attachmentId]`

- Looks up attachment in `task_attachments` by id
- Deletes file from disk
- Deletes row from `task_attachments`
- Returns: `{ success: true }`

### `POST /api/schedule/generate`

Request body:
```ts
{
  weekKey: string,
  weeklyTasks: Task[],
  monthlyTasks: Task[],
  randomTasks: Task[],
  lastWeekCompletion?: number  // completion rate 0–1
}
```

- Calls Claude `claude-sonnet-4-6` server-side via `@anthropic-ai/sdk`
- Prompt asks Claude to produce a JSON array of schedule blocks for the week
- Strips markdown fences from response, validates JSON array structure
- Deletes existing `weekly_schedule` rows for this `weekKey`
- Inserts new blocks with `sort_order` based on array index
- Returns: inserted `ScheduleBlock[]`

---

## File Serving (`src/hooks.server.ts`)

```ts
// handle hook intercepts /uploads/* requests
// Resolves /app/uploads/{rest} — validates path stays under /app/uploads/ (no traversal)
// Streams file with correct Content-Type
// Returns 404 if file not found
```

---

## Environment Variables

| Variable | Side | How accessed | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client | `import.meta.env.VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | `import.meta.env.VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `PUBLIC_AUTH_REQUIRED` | Client | `$env/static/public` | `"true"` if write-protection is enabled — shows password prompt modal |
| `SUPABASE_URL` | Server | `$env/static/private` | Supabase URL for server routes |
| `SUPABASE_SERVICE_KEY` | Server | `$env/static/private` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Server | `$env/static/private` | Claude API key |
| `ADMIN_PASSWORD` | Server | `$env/static/private` | Write-protection password |

> `ADMIN_PASSWORD` is never sent to the client. The client only knows whether auth is required (`PUBLIC_AUTH_REQUIRED`). The entered password lives in the `authPassword` store and is sent as `Authorization: Bearer` on mutating requests.

---

## Docker

### `Dockerfile`

> **Note:** `VITE_` prefixed variables are baked into the JS bundle at build time by Vite. They must be available during `npm run build`, not just at container runtime. We pass them as Docker build `ARG`s so they are present in the builder stage.

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build-time args for VITE_ vars (baked into the bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "build"]
```

### `docker-compose.yml`

```yaml
services:
  app:
    build:
      context: .
      args:
        - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
        - VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
    ports:
      - "80:3000"
    volumes:
      - uploads:/app/uploads
    environment:
      - PUBLIC_AUTH_REQUIRED=${PUBLIC_AUTH_REQUIRED:-false}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-}

volumes:
  uploads:
```

No nginx required — SvelteKit node adapter serves static assets, the app, and the `/uploads/*` handle hook.

---

## Critical Implementation Rules

1. **Snapshot before reset:** `await takeSnapshot()` must complete before `UPDATE tasks SET completed=false`. Never fire-and-forget.
2. **AI schedule — check DB first:** Only auto-generate if `weekly_schedule` is empty for the week key AND the week key is not in `generatedWeeks`. Never generate on every render.
3. **`generatedWeeks` store:** Prevents duplicate generation when navigating away and back to the same week within a session.
4. **File path safety:** In the upload handler and handle hook, resolve the full path and confirm it starts with `/app/uploads/` before reading or writing.
5. **`weekUtils.ts` is the single source of truth:** All week/date derivation imports from here. No inline date math elsewhere.
6. **API keys never reach the client:** `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`, and `ADMIN_PASSWORD` are only accessed in `+server.ts` files via `$env/static/private`.
7. **Past week is fully read-only:** `weekOffset < 0` disables all writes at both UI level (controls hidden/disabled) and API level (auth middleware applies regardless).
