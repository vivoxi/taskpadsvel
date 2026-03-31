# TaskpadSvel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TaskpadSvel — a single-user personal productivity web app with weekly/monthly/random task lists, weekly planner + AI-generated schedule, file attachments, and Docker deployment.

**Architecture:** SvelteKit 2 (Svelte 5) with server-side API routes for file uploads and AI schedule generation. All data stored in Supabase (client-side queries via TanStack Query v5). Files written to `/app/uploads` on server disk, served via a SvelteKit handle hook. Past weeks shown read-only from `history_snapshots`.

**Tech Stack:** SvelteKit 2 + Svelte 5 + TypeScript, TailwindCSS v4, shadcn-svelte, @supabase/supabase-js, @tanstack/svelte-query v5, @anthropic-ai/sdk, svelte-dnd-action, svelte-sonner, lucide-svelte, date-fns, geist, @sveltejs/adapter-node

---

## File Map

```
src/
  app.html                         # Base HTML — Geist font CDN link
  app.css                          # TailwindCSS v4 @import + shadcn theme vars
  hooks.server.ts                  # /uploads/* file serving with path-traversal guard
  lib/
    types.ts                       # Task, TaskAttachment, ScheduleBlock, WeeklyPlan, HistorySnapshot
    weekUtils.ts                   # getWeekKey, getMonthKey, getWeekDays, weekLabel, monthLabel, addWeeks, DAY_NAMES
    stores.ts                      # activeView, weekOffset, generatedWeeks, authPassword
    snapshot.ts                    # takeSnapshot(type) — writes history_snapshots before reset
    supabase.ts                    # Client-side Supabase (VITE_ vars)
    debounce.ts                    # Generic debounce utility
    server/
      supabase.ts                  # Server-side Supabase (service key)
      auth.ts                      # requireAuth(request) + _requireAuth(request, password) for testing
    components/
      Sidebar.svelte               # 4-item nav sidebar linked to routes
      PasswordModal.svelte         # Password entry modal shown when PUBLIC_AUTH_REQUIRED=true
      AttachmentChip.svelte        # Image thumbnail or filename chip with hover-delete
      TaskRow.svelte               # Task row: circular checkbox + Accordion (notes + attachments)
      TaskList.svelte              # Progress bar + sorted tasks + add-task input + optional reset
      DayCard.svelte               # Planner textarea card per day with debounced upsert
      ScheduleBlockCard.svelte     # Inline-editable time-block card
      ScheduleDay.svelte           # svelte-dnd-action wrapper for one day's schedule blocks
  routes/
    +layout.svelte                 # QueryClientProvider + flex shell (sidebar + main) + Toaster
    +page.ts                       # Redirects / → /weekly
    +page.svelte                   # Empty (redirect handled by +page.ts)
    weekly/
      +page.svelte                 # Weekly tasks view
    monthly/
      +page.svelte                 # Monthly tasks view
    random/
      +page.svelte                 # Random tasks view
    thisweek/
      +page.svelte                 # This Week: planner + AI schedule (past weeks read-only)
    api/
      upload/
        +server.ts                 # POST /api/upload
        [attachmentId]/
          +server.ts               # DELETE /api/upload/[attachmentId]
      schedule/
        generate/
          +server.ts               # POST /api/schedule/generate (calls Claude)
tests/
  weekUtils.test.ts                # Pure-function tests for weekUtils
svelte.config.js                   # adapter-node
vite.config.ts                     # @tailwindcss/vite plugin
Dockerfile
docker-compose.yml
.env.example
```

---

### Task 1: Project Scaffold

**Files:**
- Modify: `svelte.config.js`
- Modify: `vite.config.ts`
- Modify: `src/app.html`
- Create: `src/app.css`
- Create: `.env.example`

- [ ] **Step 1: Create SvelteKit project**

In the project root (`/Users/mbtkimya/Documents/taskpad svelte`), run:

```bash
npm create svelte@latest .
```

Select these options when prompted:
- Template: **Skeleton project**
- TypeScript: **Yes, using TypeScript syntax**
- ESLint: **Yes**
- Prettier: **Yes**
- Playwright: **No**
- Vitest: **Yes**

- [ ] **Step 2: Install all dependencies**

```bash
npm install
npm install @supabase/supabase-js @tanstack/svelte-query date-fns svelte-dnd-action svelte-sonner lucide-svelte @anthropic-ai/sdk geist
npm install tailwindcss @tailwindcss/vite
npm install -D @sveltejs/adapter-node
```

- [ ] **Step 3: Initialize shadcn-svelte**

```bash
npx shadcn-svelte@latest init
```

Select: zinc palette, Geist font, `src/lib/components/ui` for component path.

Then add the components used in this app:

```bash
npx shadcn-svelte@latest add progress accordion
```

- [ ] **Step 4: Update `svelte.config.js` to use node adapter**

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

- [ ] **Step 5: Update `vite.config.ts` to add TailwindCSS v4 plugin**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
```

- [ ] **Step 6: Update `src/app.html` to load Geist font**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap"
      rel="stylesheet"
    />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 7: Update `src/app.css` with TailwindCSS v4 entry**

```css
@import "tailwindcss";

@theme {
  --font-sans: 'Geist', sans-serif;
  --font-mono: 'Geist Mono', monospace;
}
```

> Note: shadcn-svelte init will add additional CSS variable declarations to this file for the zinc color palette.

- [ ] **Step 8: Create `.env.example`**

```bash
# Client-side (VITE_ prefix — baked into bundle at build time)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Client-side public (SvelteKit PUBLIC_ prefix — runtime)
PUBLIC_AUTH_REQUIRED=false

# Server-only
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_PASSWORD=          # Optional. Leave blank to disable write-protection.
```

- [ ] **Step 9: Verify scaffold compiles**

```bash
npm run build
```

Expected: Build completes with no errors. The `build/` directory is created.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold SvelteKit project with all dependencies"
```

---

### Task 2: Types and Week Utilities

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/weekUtils.ts`
- Create: `tests/weekUtils.test.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type TaskType = 'weekly' | 'monthly' | 'random';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  completed: boolean;
  notes: string;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  filename: string;
  original_name: string | null;
  mime_type: string | null;
  url: string | null;
  week_key: string | null;
  created_at: string;
}

export interface WeeklyPlan {
  id: string;
  week_key: string;
  day: string;
  content: string;
}

export interface ScheduleBlock {
  id: string;
  week_key: string;
  day: string;
  start_time: string;
  end_time: string;
  task_title: string;
  notes: string;
  sort_order: number;
}

export interface HistorySnapshot {
  id: string;
  period_type: 'weekly' | 'monthly';
  period_key: string;
  period_label: string;
  completed_tasks: Task[];
  missed_tasks: Task[];
  planner_notes: Record<string, string>;
  completion_rate: number;
  created_at: string;
}
```

- [ ] **Step 2: Write the failing tests for weekUtils**

Create `tests/weekUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getWeekKey,
  getMonthKey,
  getWeekDays,
  weekLabel,
  monthLabel,
  DAY_NAMES
} from '../src/lib/weekUtils';

describe('getWeekKey', () => {
  it('returns ISO week key for a known date', () => {
    // Apr 7, 2025 is ISO week 15 of 2025
    expect(getWeekKey(new Date(2025, 3, 7))).toBe('2025-W15');
  });

  it('pads single-digit weeks with zero', () => {
    // Jan 6, 2025 is ISO week 2 of 2025
    expect(getWeekKey(new Date(2025, 0, 6))).toBe('2025-W02');
  });
});

describe('getMonthKey', () => {
  it('returns month key with zero-padded month', () => {
    expect(getMonthKey(new Date(2025, 3, 1))).toBe('2025-M04');
  });

  it('returns correct key for December', () => {
    expect(getMonthKey(new Date(2025, 11, 1))).toBe('2025-M12');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Monday', () => {
    const days = getWeekDays('2025-W15');
    expect(days).toHaveLength(7);
    // 2025-W15 Monday = Apr 7, 2025
    expect(days[0].getFullYear()).toBe(2025);
    expect(days[0].getMonth()).toBe(3); // April
    expect(days[0].getDate()).toBe(7);
    // Sunday = Apr 13
    expect(days[6].getDate()).toBe(13);
  });
});

describe('weekLabel', () => {
  it('formats same-month range', () => {
    // W15 2025: Apr 7–13, 2025
    expect(weekLabel('2025-W15')).toBe('Apr 7–13, 2025');
  });

  it('formats cross-month range', () => {
    // W18 2025: Apr 28 – May 4, 2025
    expect(weekLabel('2025-W18')).toBe('Apr 28–May 4, 2025');
  });
});

describe('monthLabel', () => {
  it('returns full month name and year', () => {
    expect(monthLabel('2025-M04')).toBe('April 2025');
  });
});

describe('DAY_NAMES', () => {
  it('has 7 entries starting with Monday', () => {
    expect(DAY_NAMES).toHaveLength(7);
    expect(DAY_NAMES[0]).toBe('Monday');
    expect(DAY_NAMES[6]).toBe('Sunday');
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

```bash
npx vitest run tests/weekUtils.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/weekUtils'`

- [ ] **Step 4: Create `src/lib/weekUtils.ts`**

```ts
import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  addDays,
  addWeeks as dateFnsAddWeeks,
  format
} from 'date-fns';

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export function getWeekKey(date: Date = new Date()): string {
  const week = getISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-M${month}`;
}

export function getWeekDays(weekKey: string): Date[] {
  const [yearStr, weekStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = startOfISOWeek(jan4);
  const monday = addDays(startOfWeek1, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekLabel(weekKey: string): string {
  const days = getWeekDays(weekKey);
  const start = days[0];
  const end = days[6];
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
  }
  return `${format(start, 'MMM d')}–${format(end, 'MMM d, yyyy')}`;
}

export function monthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-M');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  return format(date, 'MMMM yyyy');
}

export function addWeeks(date: Date, weeks: number): Date {
  return dateFnsAddWeeks(date, weeks);
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest run tests/weekUtils.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/weekUtils.ts tests/weekUtils.test.ts
git commit -m "feat: add types and weekUtils with tests"
```

---

### Task 3: Stores, Supabase Clients, Auth Middleware, and Debounce

**Files:**
- Create: `src/lib/stores.ts`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/server/supabase.ts`
- Create: `src/lib/server/auth.ts`
- Create: `src/lib/debounce.ts`

- [ ] **Step 1: Create `src/lib/stores.ts`**

```ts
import { writable } from 'svelte/store';

export type ActiveView = 'weekly' | 'monthly' | 'random' | 'thisweek';

export const activeView = writable<ActiveView>('weekly');
export const weekOffset = writable<number>(0);
export const generatedWeeks = writable<Set<string>>(new Set());
export const authPassword = writable<string>('');
```

- [ ] **Step 2: Create `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 3: Create `src/lib/server/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from '$env/static/private';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
```

- [ ] **Step 4: Create `src/lib/server/auth.ts`**

```ts
import { ADMIN_PASSWORD } from '$env/static/private';

/**
 * Call at the top of every non-GET +server.ts handler.
 * Returns a 401 Response if auth fails, or null if auth passes.
 */
export function requireAuth(request: Request): Response | null {
  return _requireAuth(request, ADMIN_PASSWORD);
}

/**
 * Pure function for testing — accepts password directly.
 */
export function _requireAuth(request: Request, password: string | undefined): Response | null {
  if (!password) return null;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.slice(7);
  if (token !== password) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}
```

- [ ] **Step 5: Create `src/lib/debounce.ts`**

```ts
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx svelte-check
```

Expected: 0 errors (warnings about missing env vars are OK at this stage).

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores.ts src/lib/supabase.ts src/lib/server/supabase.ts src/lib/server/auth.ts src/lib/debounce.ts
git commit -m "feat: add stores, supabase clients, auth middleware, and debounce"
```

---

### Task 4: Snapshot Helper

**Files:**
- Create: `src/lib/snapshot.ts`

- [ ] **Step 1: Create `src/lib/snapshot.ts`**

```ts
import { supabase } from './supabase';
import { getWeekKey, getMonthKey, weekLabel, monthLabel } from './weekUtils';

/**
 * Captures a snapshot of tasks (and planner notes for weekly) before resetting.
 * Uses upsert so re-running is safe.
 */
export async function takeSnapshot(type: 'weekly' | 'monthly'): Promise<void> {
  const now = new Date();
  const periodKey = type === 'weekly' ? getWeekKey(now) : getMonthKey(now);
  const periodLabel =
    type === 'weekly' ? weekLabel(periodKey) : monthLabel(periodKey);

  // Fetch tasks of this type
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('type', type);

  if (tasksError) throw tasksError;
  if (!tasks) return;

  const completedTasks = tasks.filter((t) => t.completed);
  const missedTasks = tasks.filter((t) => !t.completed);
  const completionRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

  // Fetch planner notes (weekly only)
  let plannerNotes: Record<string, string> = {};
  if (type === 'weekly') {
    const { data: planRows } = await supabase
      .from('weekly_plan')
      .select('day, content')
      .eq('week_key', periodKey);

    if (planRows) {
      plannerNotes = Object.fromEntries(planRows.map((r) => [r.day, r.content]));
    }
  }

  const { error: upsertError } = await supabase.from('history_snapshots').upsert(
    {
      period_type: type,
      period_key: periodKey,
      period_label: periodLabel,
      completed_tasks: completedTasks,
      missed_tasks: missedTasks,
      planner_notes: plannerNotes,
      completion_rate: completionRate
    },
    { onConflict: 'period_type,period_key' }
  );

  if (upsertError) throw upsertError;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx svelte-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/snapshot.ts
git commit -m "feat: add takeSnapshot helper"
```

---

### Task 5: App Shell (Layout, Sidebar, Password Modal, Root Redirect)

**Files:**
- Modify: `src/routes/+layout.svelte`
- Create: `src/routes/+page.ts`
- Modify: `src/routes/+page.svelte`
- Create: `src/lib/components/Sidebar.svelte`
- Create: `src/lib/components/PasswordModal.svelte`

- [ ] **Step 1: Create `src/lib/components/Sidebar.svelte`**

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import {
    CalendarDays,
    Calendar,
    Shuffle,
    LayoutDashboard
  } from 'lucide-svelte';

  const navItems = [
    { href: '/weekly', label: 'Weekly Tasks', icon: CalendarDays },
    { href: '/monthly', label: 'Monthly Tasks', icon: Calendar },
    { href: '/random', label: 'Random Tasks', icon: Shuffle },
    { href: '/thisweek', label: 'This Week', icon: LayoutDashboard }
  ] as const;
</script>

<nav class="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col p-3 gap-1">
  <div class="px-2 py-3 mb-2">
    <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
      TaskpadSvel
    </h1>
  </div>

  {#each navItems as item}
    {@const isActive = $page.url.pathname === item.href}
    <a
      href={item.href}
      class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
        {isActive
          ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'}"
    >
      <svelte:component this={item.icon} size={16} />
      {item.label}
    </a>
  {/each}
</nav>
```

- [ ] **Step 2: Create `src/lib/components/PasswordModal.svelte`**

```svelte
<script lang="ts">
  import { authPassword } from '$lib/stores';

  let input = $state('');
  let show = $state(true);

  function submit() {
    if (input.trim()) {
      authPassword.set(input.trim());
      show = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    aria-label="Password required"
  >
    <div class="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 w-80 flex flex-col gap-4">
      <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Password Required</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        Enter the admin password to make changes.
      </p>
      <input
        type="password"
        bind:value={input}
        onkeydown={onKeydown}
        placeholder="Password"
        class="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
      />
      <button
        onclick={submit}
        class="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
      >
        Unlock
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 3: Update `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
  import '../app.css';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import { browser } from '$app/environment';
  import { PUBLIC_AUTH_REQUIRED } from '$env/static/public';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PasswordModal from '$lib/components/PasswordModal.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 1000 * 30
      }
    }
  });
</script>

<QueryClientProvider client={queryClient}>
  <div class="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
    <Sidebar />
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>

  {#if PUBLIC_AUTH_REQUIRED === 'true'}
    <PasswordModal />
  {/if}

  <Toaster richColors position="bottom-right" />
</QueryClientProvider>
```

- [ ] **Step 4: Create `src/routes/+page.ts` (root redirect)**

```ts
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
  redirect(302, '/weekly');
};
```

- [ ] **Step 5: Replace `src/routes/+page.svelte` with empty file**

```svelte
<!-- Redirect handled by +page.ts -->
```

- [ ] **Step 6: Start dev server and verify layout**

```bash
npm run dev
```

Open `http://localhost:5173`. Expected: sidebar visible with 4 nav items, clicking them changes the active highlight.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+layout.svelte src/routes/+page.ts src/routes/+page.svelte src/lib/components/Sidebar.svelte src/lib/components/PasswordModal.svelte
git commit -m "feat: app shell with sidebar, password modal, and root redirect"
```

---

### Task 6: Task Components (AttachmentChip, TaskRow, TaskList)

**Files:**
- Create: `src/lib/components/AttachmentChip.svelte`
- Create: `src/lib/components/TaskRow.svelte`
- Create: `src/lib/components/TaskList.svelte`

- [ ] **Step 1: Create `src/lib/components/AttachmentChip.svelte`**

```svelte
<script lang="ts">
  import { Paperclip, X } from 'lucide-svelte';
  import type { TaskAttachment } from '$lib/types';

  let {
    attachment,
    readonly = false,
    onDelete
  }: {
    attachment: TaskAttachment;
    readonly?: boolean;
    onDelete: (id: string) => void;
  } = $props();

  const isImage = attachment.mime_type?.startsWith('image/') ?? false;
</script>

<div class="group relative inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300">
  {#if isImage && attachment.url}
    <img
      src={attachment.url}
      alt={attachment.original_name ?? attachment.filename}
      class="h-8 w-8 rounded object-cover"
    />
  {:else}
    <Paperclip size={12} />
    <span class="max-w-[120px] truncate">{attachment.original_name ?? attachment.filename}</span>
  {/if}

  {#if !readonly}
    <button
      onclick={() => onDelete(attachment.id)}
      class="ml-1 hidden group-hover:flex items-center justify-center rounded text-zinc-400 hover:text-red-500 transition-colors"
      aria-label="Delete attachment"
    >
      <X size={12} />
    </button>
  {/if}
</div>
```

- [ ] **Step 2: Create `src/lib/components/TaskRow.svelte`**

```svelte
<script lang="ts">
  import { Paperclip } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { useQueryClient } from '@tanstack/svelte-query';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import AttachmentChip from './AttachmentChip.svelte';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { debounce } from '$lib/debounce';
  import type { Task, TaskAttachment } from '$lib/types';

  let {
    task,
    attachments = [],
    readonly = false,
    weekKey = '',
    onToggle,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    task: Task;
    attachments?: TaskAttachment[];
    readonly?: boolean;
    weekKey?: string;
    onToggle: (id: string, completed: boolean) => void;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  let fileInput: HTMLInputElement;
  let notes = $state(task.notes ?? '');

  const saveNotes = debounce(async (value: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ notes: value })
      .eq('id', task.id);
    if (error) toast.error('Failed to save notes');
  }, 500);

  function onNotesInput(e: Event) {
    notes = (e.target as HTMLTextAreaElement).value;
    saveNotes(notes);
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !weekKey) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('taskId', task.id);
    formData.append('weekKey', weekKey);

    let password = '';
    authPassword.subscribe((p) => (password = p))();

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: password ? { Authorization: `Bearer ${password}` } : {},
      body: formData
    });

    if (!res.ok) {
      toast.error('Upload failed');
      return;
    }

    const attachment = await res.json();
    onAttachmentAdded(attachment);
    fileInput.value = '';
  }

  async function handleDeleteAttachment(id: string) {
    let password = '';
    authPassword.subscribe((p) => (password = p))();

    const res = await fetch(`/api/upload/${id}`, {
      method: 'DELETE',
      headers: password ? { Authorization: `Bearer ${password}` } : {}
    });

    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    onAttachmentDeleted(id);
  }
</script>

<div class="py-1">
  <Accordion.Root type="single" collapsible>
    <Accordion.Item value={task.id} class="border-none">
      <div class="flex items-center gap-3 px-1">
        <!-- Circular checkbox -->
        <button
          onclick={() => !readonly && onToggle(task.id, !task.completed)}
          disabled={readonly}
          class="shrink-0 h-5 w-5 rounded-full border-2 transition-colors
            {task.completed
              ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100'
              : 'border-zinc-400 dark:border-zinc-600 hover:border-zinc-600 dark:hover:border-zinc-400'}
            {readonly ? 'cursor-default' : 'cursor-pointer'}"
          aria-label="{task.completed ? 'Mark incomplete' : 'Mark complete'}"
        >
          {#if task.completed}
            <svg viewBox="0 0 10 10" class="w-full h-full p-0.5" fill="none">
              <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>

        <Accordion.Trigger class="flex-1 text-left text-sm py-1 hover:no-underline
          {task.completed ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}">
          {task.title}
        </Accordion.Trigger>
      </div>

      <Accordion.Content>
        <div class="ml-8 mt-2 flex flex-col gap-3 pb-3">
          <!-- Notes textarea -->
          <textarea
            value={notes}
            oninput={onNotesInput}
            disabled={readonly}
            placeholder="Add notes..."
            rows={3}
            class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 resize-none outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
          ></textarea>

          <!-- Attachments -->
          <div class="flex flex-wrap items-center gap-2">
            {#each attachments as att (att.id)}
              <AttachmentChip
                attachment={att}
                {readonly}
                onDelete={handleDeleteAttachment}
              />
            {/each}

            {#if !readonly}
              <button
                onclick={() => fileInput.click()}
                class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-400 transition-colors"
              >
                <Paperclip size={12} />
                Attach
              </button>
              <input
                bind:this={fileInput}
                type="file"
                class="hidden"
                onchange={handleFileChange}
              />
            {/if}
          </div>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>
</div>
```

- [ ] **Step 3: Create `src/lib/components/TaskList.svelte`**

```svelte
<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import TaskRow from './TaskRow.svelte';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { getWeekKey } from '$lib/weekUtils';
  import { takeSnapshot } from '$lib/snapshot';
  import type { Task, TaskAttachment, TaskType } from '$lib/types';

  let {
    type,
    showResetButton = false
  }: {
    type: TaskType;
    showResetButton?: boolean;
  } = $props();

  const queryClient = useQueryClient();
  const weekKey = getWeekKey();

  // --- Queries ---
  const tasksQuery = createQuery({
    queryKey: ['tasks', type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('type', type)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    }
  });

  const attachmentsQuery = createQuery({
    queryKey: ['attachments', type],
    queryFn: async () => {
      const tasks = $tasksQuery.data ?? [];
      if (tasks.length === 0) return [] as TaskAttachment[];
      const ids = tasks.map((t) => t.id);
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .in('task_id', ids);
      if (error) throw error;
      return (data ?? []) as TaskAttachment[];
    },
    enabled: false // Triggered after tasks load
  });

  // Sorted tasks: incomplete first
  const sortedTasks = $derived(
    [...($tasksQuery.data ?? [])].sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    })
  );

  const completedCount = $derived(($tasksQuery.data ?? []).filter((t) => t.completed).length);
  const totalCount = $derived(($tasksQuery.data ?? []).length);
  const progressValue = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

  function getAttachmentsForTask(taskId: string): TaskAttachment[] {
    return ($attachmentsQuery.data ?? []).filter((a) => a.task_id === taskId);
  }

  // --- Auto-reset on mount (Weekly/Monthly only) ---
  let resetChecked = $state(false);

  $effect(() => {
    if (type === 'random' || resetChecked) return;
    checkAndReset();
  });

  async function checkAndReset() {
    resetChecked = true;
    const resetType = type === 'weekly' ? 'weekly' : 'monthly';
    const currentKey =
      type === 'weekly'
        ? getWeekKey()
        : (() => {
            const now = new Date();
            return `${now.getFullYear()}-M${String(now.getMonth() + 1).padStart(2, '0')}`;
          })();

    const { data: logRow } = await supabase
      .from('reset_log')
      .select('last_reset_key')
      .eq('type', resetType)
      .maybeSingle();

    if (logRow && logRow.last_reset_key === currentKey) return;

    // Needs reset — snapshot first, then reset, then log
    try {
      await takeSnapshot(resetType as 'weekly' | 'monthly');

      await supabase.from('tasks').update({ completed: false }).eq('type', type);

      await supabase
        .from('reset_log')
        .upsert({ type: resetType, last_reset_key: currentKey }, { onConflict: 'type' });

      queryClient.invalidateQueries({ queryKey: ['tasks', type] });
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} tasks reset for new period`);
    } catch (err) {
      toast.error('Reset failed');
      console.error(err);
    }
  }

  // --- Add task ---
  let newTitle = $state('');

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    newTitle = '';

    let password = '';
    authPassword.subscribe((p) => (password = p))();

    const { error } = await supabase
      .from('tasks')
      .insert({ title, type, completed: false, notes: '' });

    if (error) {
      toast.error('Failed to add task');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addTask();
  }

  // --- Toggle ---
  async function toggleTask(id: string, completed: boolean) {
    await supabase.from('tasks').update({ completed }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
  }

  // --- Reset all (Random only) ---
  async function resetAll() {
    await supabase.from('tasks').update({ completed: false }).eq('type', type);
    queryClient.invalidateQueries({ queryKey: ['tasks', type] });
    toast.success('All tasks reset');
  }

  // --- Attachment callbacks ---
  function onAttachmentAdded(_: TaskAttachment) {
    queryClient.invalidateQueries({ queryKey: ['attachments', type] });
  }

  function onAttachmentDeleted(_: string) {
    queryClient.invalidateQueries({ queryKey: ['attachments', type] });
  }
</script>

<div class="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
  <!-- Progress bar -->
  <div class="flex items-center gap-3">
    <Progress value={progressValue} class="flex-1 h-2" />
    <span class="text-sm text-zinc-500 dark:text-zinc-400 shrink-0">
      {completedCount}/{totalCount}
    </span>
  </div>

  <!-- Task list -->
  {#if $tasksQuery.isLoading}
    <div class="text-sm text-zinc-400 py-4 text-center">Loading…</div>
  {:else}
    <div class="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      {#each sortedTasks as task (task.id)}
        <TaskRow
          {task}
          attachments={getAttachmentsForTask(task.id)}
          {weekKey}
          onToggle={toggleTask}
          {onAttachmentAdded}
          {onAttachmentDeleted}
        />
      {/each}
    </div>
  {/if}

  <!-- Add task input -->
  <input
    type="text"
    bind:value={newTitle}
    onkeydown={onKeydown}
    placeholder="Add task… (Enter to save)"
    class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 placeholder:text-zinc-400"
  />

  <!-- Reset all (Random only) -->
  {#if showResetButton}
    <button
      onclick={resetAll}
      class="self-start text-xs text-zinc-400 hover:text-red-500 transition-colors"
    >
      Reset all
    </button>
  {/if}
</div>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx svelte-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/AttachmentChip.svelte src/lib/components/TaskRow.svelte src/lib/components/TaskList.svelte
git commit -m "feat: task components (AttachmentChip, TaskRow, TaskList)"
```

---

### Task 7: Weekly, Monthly, and Random Views

**Files:**
- Create: `src/routes/weekly/+page.svelte`
- Create: `src/routes/monthly/+page.svelte`
- Create: `src/routes/random/+page.svelte`

- [ ] **Step 1: Create `src/routes/weekly/+page.svelte`**

```svelte
<script lang="ts">
  import TaskList from '$lib/components/TaskList.svelte';
</script>

<svelte:head>
  <title>Weekly Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-6">
  <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Weekly Tasks</h2>
  <TaskList type="weekly" />
</div>
```

- [ ] **Step 2: Create `src/routes/monthly/+page.svelte`**

```svelte
<script lang="ts">
  import TaskList from '$lib/components/TaskList.svelte';
</script>

<svelte:head>
  <title>Monthly Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-6">
  <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Monthly Tasks</h2>
  <TaskList type="monthly" />
</div>
```

- [ ] **Step 3: Create `src/routes/random/+page.svelte`**

```svelte
<script lang="ts">
  import TaskList from '$lib/components/TaskList.svelte';
</script>

<svelte:head>
  <title>Random Tasks — TaskpadSvel</title>
</svelte:head>

<div class="p-6">
  <h2 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Random Tasks</h2>
  <TaskList type="random" showResetButton />
</div>
```

- [ ] **Step 4: Verify dev server renders all three routes**

```bash
npm run dev
```

Navigate to `/weekly`, `/monthly`, `/random`. Each should show a progress bar and an "Add task" input.

- [ ] **Step 5: Commit**

```bash
git add src/routes/weekly src/routes/monthly src/routes/random
git commit -m "feat: weekly, monthly, and random task views"
```

---

### Task 8: File Upload API, Delete API, and File Serving Hook

**Files:**
- Create: `src/routes/api/upload/+server.ts`
- Create: `src/routes/api/upload/[attachmentId]/+server.ts`
- Create: `src/hooks.server.ts`

- [ ] **Step 1: Create `src/routes/api/upload/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const UPLOADS_DIR = '/app/uploads';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const taskId = formData.get('taskId') as string | null;
  const weekKey = formData.get('weekKey') as string | null;

  if (!file || !taskId || !weekKey) {
    throw error(400, 'Missing required fields: file, taskId, weekKey');
  }

  const ext = path.extname(file.name);
  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  const dirPath = path.join(UPLOADS_DIR, weekKey);
  const filePath = path.join(dirPath, filename);

  // Path traversal guard
  const normalizedBase = path.normalize(UPLOADS_DIR) + path.sep;
  if (!filePath.startsWith(normalizedBase)) {
    throw error(400, 'Invalid path');
  }

  await mkdir(dirPath, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const url = `/uploads/${weekKey}/${filename}`;

  const { data, error: dbError } = await supabaseAdmin
    .from('task_attachments')
    .insert({
      task_id: taskId,
      filename,
      original_name: file.name,
      mime_type: file.type || null,
      url,
      week_key: weekKey
    })
    .select()
    .single();

  if (dbError) throw error(500, dbError.message);
  return json(data);
};
```

- [ ] **Step 2: Create `src/routes/api/upload/[attachmentId]/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit';
import { unlink } from 'fs/promises';
import path from 'path';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const UPLOADS_DIR = '/app/uploads';

export const DELETE: RequestHandler = async ({ request, params }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { attachmentId } = params;

  const { data: attachment, error: fetchError } = await supabaseAdmin
    .from('task_attachments')
    .select('filename, week_key')
    .eq('id', attachmentId)
    .single();

  if (fetchError || !attachment) throw error(404, 'Attachment not found');

  // Build file path and validate
  const filePath = path.join(UPLOADS_DIR, attachment.week_key ?? '', attachment.filename);
  const normalizedBase = path.normalize(UPLOADS_DIR) + path.sep;
  if (!filePath.startsWith(normalizedBase)) {
    throw error(400, 'Invalid path');
  }

  try {
    await unlink(filePath);
  } catch {
    // File missing on disk is non-fatal — continue to remove DB row
  }

  const { error: dbError } = await supabaseAdmin
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) throw error(500, dbError.message);
  return json({ success: true });
};
```

- [ ] **Step 3: Create `src/hooks.server.ts`**

```ts
import type { Handle } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = '/app/uploads';
const NORMALIZED_UPLOADS_DIR = path.normalize(UPLOADS_DIR) + path.sep;

function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext.toLowerCase()] ?? 'application/octet-stream';
}

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/uploads/')) {
    const relativePath = event.url.pathname.slice('/uploads/'.length);
    const filePath = path.resolve(UPLOADS_DIR, relativePath);

    // Path traversal guard
    if (!filePath.startsWith(NORMALIZED_UPLOADS_DIR)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      return new Response(data, {
        headers: { 'Content-Type': getMimeType(ext) }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  return resolve(event);
};
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx svelte-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/upload src/hooks.server.ts
git commit -m "feat: file upload/delete API routes and /uploads/* serving hook"
```

---

### Task 9: AI Schedule Generate API

**Files:**
- Create: `src/routes/api/schedule/generate/+server.ts`

- [ ] **Step 1: Create `src/routes/api/schedule/generate/+server.ts`**

```ts
import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';
import type { Task } from '$lib/types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const {
    weekKey,
    weeklyTasks,
    monthlyTasks,
    randomTasks,
    lastWeekCompletion
  }: {
    weekKey: string;
    weeklyTasks: Task[];
    monthlyTasks: Task[];
    randomTasks: Task[];
    lastWeekCompletion?: number;
  } = body;

  if (!weekKey) throw error(400, 'weekKey is required');

  const taskLines = [
    ...weeklyTasks.map((t: Task) => `[Weekly] ${t.title}${t.completed ? ' ✓' : ''}`),
    ...monthlyTasks.map((t: Task) => `[Monthly] ${t.title}${t.completed ? ' ✓' : ''}`),
    ...randomTasks.map((t: Task) => `[Random] ${t.title}${t.completed ? ' ✓' : ''}`)
  ].join('\n');

  const completionNote =
    lastWeekCompletion !== undefined
      ? `\nLast week's completion rate: ${Math.round(lastWeekCompletion * 100)}%. Adjust difficulty accordingly.`
      : '';

  const prompt = `You are a personal productivity assistant. Create a weekly schedule for ${weekKey}.

Tasks to schedule:
${taskLines || '(No tasks — create a light general schedule)'}
${completionNote}

Return ONLY a JSON array. No markdown fences. No explanation. Each element must have exactly these fields:
{
  "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "task_title": "string",
  "notes": "string"
}

Rules:
- Use 24-hour time format (e.g., "09:00", "14:30")
- Distribute tasks realistically across Mon–Fri primarily
- Include short focus blocks (25–90 min each)
- Keep notes brief (one sentence max, or empty string)
- Return the raw JSON array only`;

  let responseText: string;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    responseText = content.text.trim();
  } catch (err) {
    throw error(502, `Claude API error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strip possible markdown fences
  responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let blocks: Array<{
    day: string;
    start_time: string;
    end_time: string;
    task_title: string;
    notes: string;
  }>;

  try {
    blocks = JSON.parse(responseText);
    if (!Array.isArray(blocks)) throw new Error('Response is not an array');
  } catch (parseErr) {
    throw error(500, `Failed to parse AI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
  }

  // Replace existing schedule for this week
  const { error: deleteError } = await supabaseAdmin
    .from('weekly_schedule')
    .delete()
    .eq('week_key', weekKey);

  if (deleteError) throw error(500, deleteError.message);

  const toInsert = blocks.map((b, i) => ({
    week_key: weekKey,
    day: b.day,
    start_time: b.start_time,
    end_time: b.end_time,
    task_title: b.task_title,
    notes: b.notes ?? '',
    sort_order: i
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('weekly_schedule')
    .insert(toInsert)
    .select();

  if (insertError) throw error(500, insertError.message);
  return json(data);
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx svelte-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/schedule
git commit -m "feat: AI schedule generate API route (Claude claude-sonnet-4-6)"
```

---

### Task 10: This Week View (DayCard, ScheduleBlockCard, ScheduleDay, Page)

**Files:**
- Create: `src/lib/components/DayCard.svelte`
- Create: `src/lib/components/ScheduleBlockCard.svelte`
- Create: `src/lib/components/ScheduleDay.svelte`
- Create: `src/routes/thisweek/+page.svelte`

- [ ] **Step 1: Create `src/lib/components/DayCard.svelte`**

```svelte
<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { debounce } from '$lib/debounce';
  import { toast } from 'svelte-sonner';

  let {
    weekKey,
    day,
    initialContent = '',
    isToday = false,
    readonly = false
  }: {
    weekKey: string;
    day: string;
    initialContent?: string;
    isToday?: boolean;
    readonly?: boolean;
  } = $props();

  let content = $state(initialContent);

  const saveContent = debounce(async (value: string) => {
    const { error } = await supabase.from('weekly_plan').upsert(
      { week_key: weekKey, day, content: value },
      { onConflict: 'week_key,day' }
    );
    if (error) toast.error('Failed to save planner note');
  }, 500);

  function onInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    saveContent(content);
  }
</script>

<div
  class="flex flex-col rounded-lg border p-3 gap-2
    {isToday
      ? 'border-blue-400 dark:border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
      : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900'}"
>
  <div class="flex items-center gap-2">
    <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
      {day}
    </span>
    {#if isToday}
      <span class="text-xs text-blue-500 font-medium">Today</span>
    {/if}
  </div>
  <textarea
    value={content}
    oninput={onInput}
    disabled={readonly}
    placeholder="Notes for {day}…"
    rows={4}
    class="w-full bg-transparent text-sm text-zinc-700 dark:text-zinc-300 resize-none outline-none placeholder:text-zinc-400 disabled:opacity-60"
  ></textarea>
</div>
```

- [ ] **Step 2: Create `src/lib/components/ScheduleBlockCard.svelte`**

```svelte
<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import type { ScheduleBlock } from '$lib/types';

  let {
    block,
    readonly = false,
    onUpdate
  }: {
    block: ScheduleBlock;
    readonly?: boolean;
    onUpdate: (updated: ScheduleBlock) => void;
  } = $props();

  type EditableField = 'start_time' | 'end_time' | 'task_title' | 'notes';

  let editingField = $state<EditableField | null>(null);
  let editValue = $state('');

  function startEdit(field: EditableField) {
    if (readonly) return;
    editingField = field;
    editValue = String(block[field]);
  }

  async function commitEdit() {
    if (!editingField) return;
    const field = editingField;
    const value = editValue;
    editingField = null;

    const updated = { ...block, [field]: value };
    onUpdate(updated);

    const { error } = await supabase
      .from('weekly_schedule')
      .update({ [field]: value })
      .eq('id', block.id);

    if (error) toast.error('Failed to save');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && editingField !== 'notes') {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === 'Escape') {
      editingField = null;
    }
  }
</script>

<div class="group flex flex-col gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm cursor-default">
  <!-- Time range -->
  <div class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
    {#if editingField === 'start_time'}
      <input
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
        autofocus
      />
    {:else}
      <button onclick={() => startEdit('start_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.start_time}
      </button>
    {/if}
    <span>–</span>
    {#if editingField === 'end_time'}
      <input
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="w-14 bg-transparent border-b border-zinc-400 outline-none"
        autofocus
      />
    {:else}
      <button onclick={() => startEdit('end_time')} class="hover:text-zinc-900 dark:hover:text-zinc-100">
        {block.end_time}
      </button>
    {/if}
  </div>

  <!-- Title -->
  {#if editingField === 'task_title'}
    <input
      type="text"
      bind:value={editValue}
      onblur={commitEdit}
      onkeydown={onKeydown}
      class="font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-zinc-400 outline-none w-full"
      autofocus
    />
  {:else}
    <button
      onclick={() => startEdit('task_title')}
      class="text-left font-medium text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    >
      {block.task_title}
    </button>
  {/if}

  <!-- Notes -->
  {#if block.notes || editingField === 'notes'}
    {#if editingField === 'notes'}
      <textarea
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        rows={2}
        class="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border border-zinc-300 dark:border-zinc-600 rounded px-1 outline-none resize-none w-full"
        autofocus
      ></textarea>
    {:else}
      <button
        onclick={() => startEdit('notes')}
        class="text-left text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {block.notes}
      </button>
    {/if}
  {:else if !readonly}
    <button
      onclick={() => startEdit('notes')}
      class="hidden group-hover:block text-left text-xs text-zinc-300 dark:text-zinc-600 hover:text-zinc-500"
    >
      + notes
    </button>
  {/if}
</div>
```

- [ ] **Step 3: Create `src/lib/components/ScheduleDay.svelte`**

```svelte
<script lang="ts">
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { supabase } from '$lib/supabase';
  import ScheduleBlockCard from './ScheduleBlockCard.svelte';
  import type { ScheduleBlock } from '$lib/types';

  let {
    day,
    blocks,
    readonly = false,
    onBlocksReordered
  }: {
    day: string;
    blocks: ScheduleBlock[];
    readonly?: boolean;
    onBlocksReordered: (day: string, reordered: ScheduleBlock[]) => void;
  } = $props();

  let localBlocks = $state([...blocks]);

  $effect(() => {
    localBlocks = [...blocks];
  });

  function handleDndConsider(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    localBlocks = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<ScheduleBlock>>) {
    localBlocks = e.detail.items;
    onBlocksReordered(day, localBlocks);

    // Persist sort_order
    const updates = localBlocks.map((b, i) =>
      supabase.from('weekly_schedule').update({ sort_order: i }).eq('id', b.id)
    );
    await Promise.all(updates);
  }

  function onUpdate(updated: ScheduleBlock) {
    localBlocks = localBlocks.map((b) => (b.id === updated.id ? updated : b));
  }
</script>

<div class="flex flex-col gap-2">
  <h4 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
    {day}
  </h4>

  {#if localBlocks.length === 0}
    <p class="text-xs text-zinc-400 italic py-1">No blocks scheduled</p>
  {:else if readonly}
    <div class="flex flex-col gap-1.5">
      {#each localBlocks as block (block.id)}
        <ScheduleBlockCard {block} {readonly} onUpdate={() => {}} />
      {/each}
    </div>
  {:else}
    <div
      use:dndzone={{ items: localBlocks, flipDurationMs: 150 }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
      class="flex flex-col gap-1.5 min-h-[20px]"
    >
      {#each localBlocks as block (block.id)}
        <div class="cursor-grab active:cursor-grabbing">
          <ScheduleBlockCard {block} {readonly} {onUpdate} />
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Create `src/routes/thisweek/+page.svelte`**

```svelte
<script lang="ts">
  import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import DayCard from '$lib/components/DayCard.svelte';
  import ScheduleDay from '$lib/components/ScheduleDay.svelte';
  import { supabase } from '$lib/supabase';
  import { weekOffset, generatedWeeks, authPassword } from '$lib/stores';
  import { getWeekKey, getWeekDays, weekLabel, addWeeks, DAY_NAMES } from '$lib/weekUtils';
  import type { ScheduleBlock, WeeklyPlan, HistorySnapshot, Task } from '$lib/types';

  const queryClient = useQueryClient();

  // --- Derived week state ---
  const today = new Date();
  const currentWeekKey = $derived(getWeekKey(addWeeks(today, $weekOffset)));
  const isPastWeek = $derived($weekOffset < 0);
  const weekDays = $derived(getWeekDays(currentWeekKey));

  function isToday(dayIndex: number): boolean {
    if ($weekOffset !== 0) return false;
    return new Date().getDay() === (dayIndex + 1) % 7; // Mon=1 ... Sun=0
  }

  // --- Planner data (current/future weeks) ---
  const planQuery = createQuery({
    queryKey: ['weekly_plan', currentWeekKey],
    queryFn: async () => {
      if (isPastWeek) return [] as WeeklyPlan[];
      const { data, error } = await supabase
        .from('weekly_plan')
        .select('*')
        .eq('week_key', currentWeekKey);
      if (error) throw error;
      return (data ?? []) as WeeklyPlan[];
    },
    enabled: browser && !isPastWeek
  });

  function getPlanContent(day: string): string {
    return $planQuery.data?.find((p) => p.day === day)?.content ?? '';
  }

  // --- Schedule data ---
  const scheduleQuery = createQuery({
    queryKey: ['weekly_schedule', currentWeekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_schedule')
        .select('*')
        .eq('week_key', currentWeekKey)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleBlock[];
    },
    enabled: browser
  });

  function getBlocksForDay(day: string): ScheduleBlock[] {
    return ($scheduleQuery.data ?? []).filter((b) => b.day === day);
  }

  // --- Tasks (for AI generation) ---
  const tasksQuery = createQuery({
    queryKey: ['tasks_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser && !isPastWeek
  });

  // --- Auto-generate schedule (current/future weeks only) ---
  let generating = $state(false);
  let autoGenAttempted = $state(false);

  $effect(() => {
    if (!browser || isPastWeek || autoGenAttempted) return;
    if (!$scheduleQuery.data || !$tasksQuery.data) return;
    if ($scheduleQuery.data.length > 0) return;

    let alreadyGenerated = false;
    generatedWeeks.subscribe((s) => (alreadyGenerated = s.has(currentWeekKey)))();
    if (alreadyGenerated) return;

    autoGenAttempted = true;
    generateSchedule();
  });

  async function generateSchedule() {
    if (isPastWeek || generating) return;
    generating = true;

    const tasks = $tasksQuery.data ?? [];

    let password = '';
    authPassword.subscribe((p) => (password = p))();

    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { Authorization: `Bearer ${password}` } : {})
        },
        body: JSON.stringify({
          weekKey: currentWeekKey,
          weeklyTasks: tasks.filter((t) => t.type === 'weekly'),
          monthlyTasks: tasks.filter((t) => t.type === 'monthly'),
          randomTasks: tasks.filter((t) => t.type === 'random')
        })
      });

      if (!res.ok) throw new Error(await res.text());

      generatedWeeks.update((s) => new Set([...s, currentWeekKey]));
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.success('Schedule generated');
    } catch (err) {
      toast.error('Failed to generate schedule');
      console.error(err);
    } finally {
      generating = false;
    }
  }

  // --- Past week: snapshot data ---
  const snapshotQuery = createQuery({
    queryKey: ['snapshot', currentWeekKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'weekly')
        .eq('period_key', currentWeekKey)
        .maybeSingle();
      return data as HistorySnapshot | null;
    },
    enabled: browser && isPastWeek
  });

  function getPastPlannerNote(day: string): string {
    return $snapshotQuery.data?.planner_notes?.[day] ?? '';
  }

  function getPastTasks(): Task[] {
    if (!$snapshotQuery.data) return [];
    return [
      ...($snapshotQuery.data.completed_tasks ?? []),
      ...($snapshotQuery.data.missed_tasks ?? [])
    ];
  }

  // --- DnD reorder callback ---
  function onBlocksReordered(day: string, reordered: ScheduleBlock[]) {
    queryClient.setQueryData<ScheduleBlock[]>(
      ['weekly_schedule', currentWeekKey],
      (prev) => {
        if (!prev) return reordered;
        return [
          ...prev.filter((b) => b.day !== day),
          ...reordered
        ].sort((a, b) => a.sort_order - b.sort_order);
      }
    );
  }
</script>

<svelte:head>
  <title>This Week — TaskpadSvel</title>
</svelte:head>

<div class="flex flex-col h-full">
  <!-- Week navigation header -->
  <div class="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
    <button
      onclick={() => weekOffset.update((n) => n - 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label="Previous week"
    >
      <ChevronLeft size={16} />
    </button>

    <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100 min-w-[160px] text-center">
      {weekLabel(currentWeekKey)}
    </span>

    <button
      onclick={() => weekOffset.update((n) => n + 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label="Next week"
    >
      <ChevronRight size={16} />
    </button>

    {#if $weekOffset !== 0}
      <button
        onclick={() => weekOffset.set(0)}
        class="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors ml-1"
      >
        This week
      </button>
    {/if}

    <div class="flex-1" />

    {#if isPastWeek}
      <span class="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-medium">
        Archived Week — Read Only
      </span>
    {:else}
      <button
        onclick={generateSchedule}
        disabled={generating}
        class="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} class={generating ? 'animate-spin' : ''} />
        {generating ? 'Generating…' : 'Regenerate'}
      </button>
    {/if}
  </div>

  <!-- Two-column layout -->
  <div class="flex flex-1 overflow-hidden">
    <!-- Left 40%: Daily Planner -->
    <div class="w-[40%] border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4 flex flex-col gap-3">
      <h3 class="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
        Daily Planner
      </h3>

      {#if isPastWeek}
        <!-- Past week: show planner notes from snapshot (read-only) -->
        {#if $snapshotQuery.isLoading}
          <div class="text-sm text-zinc-400 text-center py-4">Loading…</div>
        {:else if !$snapshotQuery.data}
          <p class="text-sm text-zinc-400 italic text-center py-4">No snapshot available for this week.</p>
        {:else}
          {#each DAY_NAMES as day, i}
            <DayCard
              weekKey={currentWeekKey}
              {day}
              initialContent={getPastPlannerNote(day)}
              isToday={false}
              readonly={true}
            />
          {/each}
        {/if}

        <!-- Past week: task summary from snapshot -->
        {#if $snapshotQuery.data}
          <div class="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <h4 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Tasks</h4>
            <div class="flex flex-col gap-1">
              {#each getPastTasks() as task (task.id)}
                <div class="flex items-center gap-2 text-sm">
                  <span
                    class="h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center
                      {task.completed
                        ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100'
                        : 'border-zinc-400 dark:border-zinc-600'}"
                  >
                    {#if task.completed}
                      <svg viewBox="0 0 10 10" class="w-full h-full p-0.5" fill="none">
                        <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                  </span>
                  <span class="{task.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}">{task.title}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <!-- Current/future week: editable planner -->
        {#each DAY_NAMES as day, i}
          <DayCard
            weekKey={currentWeekKey}
            {day}
            initialContent={getPlanContent(day)}
            isToday={isToday(i)}
            readonly={false}
          />
        {/each}
      {/if}
    </div>

    <!-- Right 60%: AI Schedule -->
    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <h3 class="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
        AI Schedule
      </h3>

      {#if $scheduleQuery.isLoading}
        <div class="text-sm text-zinc-400 text-center py-4">Loading…</div>
      {:else if generating}
        <div class="text-sm text-zinc-400 text-center py-4 animate-pulse">Generating schedule…</div>
      {:else}
        {#each DAY_NAMES as day}
          {#if getBlocksForDay(day).length > 0}
            <ScheduleDay
              {day}
              blocks={getBlocksForDay(day)}
              readonly={isPastWeek}
              {onBlocksReordered}
            />
          {/if}
        {/each}

        {#if ($scheduleQuery.data ?? []).length === 0}
          <p class="text-sm text-zinc-400 italic text-center py-4">
            {isPastWeek ? 'No schedule for this week.' : 'No schedule yet. Click Regenerate to create one.'}
          </p>
        {/if}
      {/if}
    </div>
  </div>
</div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx svelte-check
```

Expected: 0 errors.

- [ ] **Step 6: Smoke test in dev**

```bash
npm run dev
```

Navigate to `/thisweek`. Verify:
- Week label displays in header
- Prev/next arrows change the week label
- "This week" button resets to current week
- Past weeks show "Archived Week — Read Only" banner

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/DayCard.svelte src/lib/components/ScheduleBlockCard.svelte src/lib/components/ScheduleDay.svelte src/routes/thisweek
git commit -m "feat: This Week view with planner, AI schedule, and read-only past week mode"
```

---

### Task 11: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# VITE_ vars are baked into the client bundle at build time.
# Pass them as Docker build ARGs so they're available during npm run build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ---- Runtime stage ----
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "build"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

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
    restart: unless-stopped

volumes:
  uploads:
```

- [ ] **Step 3: Create `.dockerignore`**

```
node_modules
build
.svelte-kit
.env
.env.*
!.env.example
```

- [ ] **Step 4: Full build test**

```bash
npm run build
```

Expected: `build/` directory created, `build/index.js` present.

- [ ] **Step 5: Test Docker build locally (requires Docker)**

Copy `.env.example` to `.env` and fill in real values, then:

```bash
docker compose build
docker compose up
```

Open `http://localhost`. Expected: app loads, sidebar shows 4 nav items.

- [ ] **Step 6: Final commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker setup with named uploads volume and build args for VITE_ vars"
```

---

## Self-Review — Spec Coverage Checklist

| Spec requirement | Task covering it |
|---|---|
| `weekUtils.ts` single source of truth | Task 2 |
| All 4 Svelte stores | Task 3 |
| `takeSnapshot()` with correct field mapping | Task 4 |
| App shell, sidebar, password modal | Task 5 |
| Circular checkbox, accordion notes, file attachments | Task 6 |
| Progress bar, add-task input, sorted incomplete-first | Task 6 (`TaskList`) |
| Auto-reset weekly/monthly on mount | Task 6 (`TaskList`) |
| Reset all (Random only) | Task 6 (`TaskList`) |
| Weekly / Monthly / Random pages | Task 7 |
| `POST /api/upload` with path guard | Task 8 |
| `DELETE /api/upload/[id]` | Task 8 |
| `/uploads/*` file serving with traversal guard | Task 8 |
| `POST /api/schedule/generate` (Claude claude-sonnet-4-6) | Task 9 |
| Strip markdown fences, validate JSON array | Task 9 |
| Daily Planner (DayCard, debounced save, today highlighted) | Task 10 |
| AI Schedule (ScheduleBlockCard inline edit, drag-to-reorder) | Task 10 |
| Auto-generate once per weekKey per session | Task 10 |
| Regenerate button | Task 10 |
| Past week read-only view with banner | Task 10 |
| Past week: tasks from snapshot, plan from snapshot, schedule from DB | Task 10 |
| Empty state for missing snapshot | Task 10 |
| `PUBLIC_AUTH_REQUIRED` boolean flag | Task 5 |
| `Authorization: Bearer` header on mutations | Tasks 6, 10 |
| `requireAuth()` middleware in all non-GET handlers | Tasks 8, 9 |
| `Dockerfile` with `ARG`/`ENV` for VITE_ build vars | Task 11 |
| `docker-compose.yml` with named volume `uploads:/app/uploads` | Task 11 |
