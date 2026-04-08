<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-svelte';
  import MonthStrip from '$lib/components/MonthStrip.svelte';
  import { toast } from 'svelte-sonner';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { isSameDay } from 'date-fns';
  import { apiSendJson } from '$lib/client/api';
  import { DAY_NAMES, type DayName, type TaskInstance } from '$lib/planner/types';
  import {
    getMonthKey,
    getWeekDays,
    getPreviousMonthKey,
    getNextMonthKey
  } from '$lib/planner/dates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type CalendarCell = {
    id: string;
    date: Date;
    weekKey: string;
    dayName: DayName;
    dateNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    tasks: TaskInstance[];
  };

  const today = new Date();
  const FLIP_MS = 200;
  const DND_TYPE = 'calendar-task';
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

  let cells = $state<CalendarCell[]>([]);
  let unassigned = $state<TaskInstance[]>([]);

  $effect(() => {
    const { instances, weeks, monthKey } = data.view;

    const built: CalendarCell[] = [];
    for (const week of weeks) {
      const weekDays = getWeekDays(week.weekKey);
      for (let i = 0; i < 7; i++) {
        const date = weekDays[i]!;
        const dayName = DAY_NAMES[i]!;
        built.push({
          id: `${week.weekKey}:${dayName}`,
          date,
          weekKey: week.weekKey,
          dayName,
          dateNum: date.getDate(),
          isCurrentMonth: getMonthKey(date) === monthKey,
          isToday: isSameDay(date, today),
          tasks: instances.filter(
            (t) => t.week_key === week.weekKey && t.day_name === dayName
          )
        });
      }
    }

    cells = built;
    unassigned = instances.filter((t) => !t.week_key || !t.day_name);
  });

  // ── DnD handlers ─────────────────────────────────────────────────────────

  function handleConsider(cellId: string, e: CustomEvent<DndEvent<TaskInstance>>) {
    const idx = cells.findIndex((c) => c.id === cellId);
    if (idx >= 0) cells[idx] = { ...cells[idx], tasks: e.detail.items };
  }

  async function handleFinalize(cellId: string, e: CustomEvent<DndEvent<TaskInstance>>) {
    const idx = cells.findIndex((c) => c.id === cellId);
    if (idx < 0) return;

    const cell = cells[idx];
    const newTasks = e.detail.items;
    cells[idx] = { ...cells[idx], tasks: newTasks };

    // Tasks whose stored assignment differs from this cell → they moved here
    const moved = newTasks.filter(
      (t) => t.week_key !== cell.weekKey || t.day_name !== cell.dayName
    );

    for (const task of moved) {
      try {
        await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', {
          week_key: cell.weekKey,
          day_name: cell.dayName,
          existing_month_key: data.view.monthKey,
          existing_week_key: task.week_key
        });
        // Stamp new position so future consider/finalize events detect correctly
        cells[idx] = {
          ...cells[idx],
          tasks: cells[idx].tasks.map((t) =>
            t.id === task.id ? { ...t, week_key: cell.weekKey, day_name: cell.dayName } : t
          )
        };
      } catch {
        toast.error('Failed to move task');
        await invalidateAll();
      }
    }
  }

  function handleUnassignedConsider(e: CustomEvent<DndEvent<TaskInstance>>) {
    unassigned = e.detail.items;
  }

  async function handleUnassignedFinalize(e: CustomEvent<DndEvent<TaskInstance>>) {
    const newItems = e.detail.items;
    // Items that had an assignment and were dragged back to unassigned
    const cleared = newItems.filter((t) => t.week_key || t.day_name);
    unassigned = newItems;

    for (const task of cleared) {
      try {
        await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', {
          week_key: null,
          day_name: null,
          existing_month_key: data.view.monthKey,
          existing_week_key: task.week_key
        });
        unassigned = unassigned.map((t) =>
          t.id === task.id ? { ...t, week_key: null, day_name: null } : t
        );
      } catch {
        toast.error('Failed to unassign task');
        await invalidateAll();
      }
    }
  }

  // ── Task completion toggle ────────────────────────────────────────────────

  async function toggleTask(task: TaskInstance) {
    const next: 'open' | 'done' = task.status === 'done' ? 'open' : 'done';

    const stamp = (t: TaskInstance): TaskInstance =>
      t.id === task.id
        ? { ...t, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
        : t;

    for (let i = 0; i < cells.length; i++) {
      cells[i] = { ...cells[i], tasks: cells[i].tasks.map(stamp) };
    }
    unassigned = unassigned.map(stamp);

    try {
      await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', { status: next });
    } catch {
      toast.error('Failed to update task');
      await invalidateAll();
    }
  }

  // ── Inbox task quick-add ─────────────────────────────────────────────────

  let newTaskTitle = $state('');
  let newTaskHours = $state<number | null>(null);
  let addingTask = $state(false);
  let quickAddInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (addingTask) quickAddInput?.focus();
  });

  async function addInboxTask() {
    const title = newTaskTitle.trim();
    if (!title) return;

    const hoursNeeded = typeof newTaskHours === 'number' && Number.isFinite(newTaskHours) ? newTaskHours : null;

    const optimisticTask: TaskInstance = {
      id: crypto.randomUUID(),
      template_id: null,
      title_snapshot: title,
      instance_kind: 'weekly',
      week_key: null,
      month_key: data.view.monthKey,
      week_of_month: null,
      day_name: null,
      status: 'open',
      completed_at: null,
      priority: 'medium',
      due_date: null,
      hours_needed: hoursNeeded,
      category: null,
      source_type: 'inbox',
      preferred_day: null,
      preferred_week: null,
      carried_from_instance_id: null,
      archived_at: null,
      archive_reason: null,
      linked_schedule_block_id: null,
      sort_order: null,
      source_context: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    newTaskTitle = '';
    newTaskHours = null;
    unassigned = [...unassigned, optimisticTask];

    try {
      const result = await apiSendJson('/api/task-instances', 'POST', {
        title: optimisticTask.title_snapshot,
        monthKey: data.view.monthKey,
        hoursNeeded
      });
      // Replace optimistic entry with real one from server
      unassigned = unassigned.map((t) =>
        t.id === optimisticTask.id ? (result as { instance: TaskInstance }).instance : t
      );
    } catch {
      toast.error('Failed to add task');
      unassigned = unassigned.filter((t) => t.id !== optimisticTask.id);
    }
  }

  // ── Inline edit ──────────────────────────────────────────────────────────

  let editingTaskId = $state<string | null>(null);
  let editTitle = $state('');
  let editHours = $state<number | null>(null);

  function startEdit(task: TaskInstance) {
    editingTaskId = task.id;
    editTitle = task.title_snapshot;
    editHours = task.hours_needed;
  }

  function cancelEdit() {
    editingTaskId = null;
  }

  async function saveEdit(taskId: string) {
    const title = editTitle.trim();
    if (!title) return;

    const hoursNeeded = typeof editHours === 'number' && Number.isFinite(editHours) ? editHours : null;

    unassigned = unassigned.map((t) =>
      t.id === taskId ? { ...t, title_snapshot: title, hours_needed: hoursNeeded } : t
    );
    editingTaskId = null;

    try {
      await apiSendJson(`/api/task-instances/${taskId}`, 'PATCH', {
        title_snapshot: title,
        hours_needed: hoursNeeded
      });
    } catch {
      toast.error('Failed to save');
      await invalidateAll();
    }
  }

  async function deleteUnassignedTask(taskId: string) {
    unassigned = unassigned.filter((t) => t.id !== taskId);
    editingTaskId = null;

    try {
      await apiSendJson(`/api/task-instances/${taskId}`, 'PATCH', {
        archived_at: new Date().toISOString(),
        archive_reason: 'deleted'
      });
    } catch {
      toast.error('Failed to delete');
      await invalidateAll();
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function navMonth(offset: -1 | 1) {
    const fn = offset === -1 ? getPreviousMonthKey : getNextMonthKey;
    void goto(`/dashboard?month=${fn(data.view.monthKey)}`);
  }

  const totalTasks = $derived(cells.reduce((n, c) => n + c.tasks.length, 0) + unassigned.length);
  const doneTasks = $derived(
    cells.reduce((n, c) => n + c.tasks.filter((t) => t.status === 'done').length, 0) +
      unassigned.filter((t) => t.status === 'done').length
  );
</script>

<div class="flex h-full flex-col">
  <!-- ── Header row 1: title + sequential nav ── -->
  <div
    class="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/90 px-6 py-3 backdrop-blur"
  >
    <div class="flex items-baseline gap-3">
      <h1 class="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        {data.view.label}
      </h1>
      {#if totalTasks > 0}
        <span class="text-xs text-[var(--text-faint)]">{doneTasks}/{totalTasks} done</span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={() => navMonth(-1)}
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        onclick={() => void goto('/dashboard')}
        class="h-8 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--text-primary)]"
      >
        Today
      </button>
      <button
        onclick={() => navMonth(1)}
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  </div>

  <!-- ── Header row 2: year/month strip ── -->
  <MonthStrip monthKey={data.view.monthKey} basePath="/dashboard" />

  <!-- ── Calendar ── -->
  <div class="flex-1 overflow-auto p-4 md:p-6">
    <div class="rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-card)] overflow-hidden">

      <!-- Day-of-week header -->
      <div class="grid grid-cols-7 border-b border-[var(--border)]">
        {#each DAY_LABELS as label}
          <div
            class="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-widest text-[var(--text-faint)]"
          >
            {label}
          </div>
        {/each}
      </div>

      <!-- Week rows -->
      {#each data.view.weeks as week, wi (week.weekKey)}
        {@const weekCells = cells.slice(wi * 7, wi * 7 + 7)}
        <div
          class="grid grid-cols-7 {wi < data.view.weeks.length - 1
            ? 'border-b border-[var(--border)]'
            : ''}"
        >
          {#each weekCells as cell (cell.id)}
            <div
              class={[
                'relative min-h-[7.5rem] border-r border-[var(--border)] p-1.5 last:border-r-0',
                cell.isToday ? 'bg-[var(--panel-strong)]' : '',
                !cell.isCurrentMonth ? 'bg-[var(--background)]' : ''
              ].join(' ')}
            >
              <!-- Day number — links to that day on the week page -->
              <div class="mb-1.5">
                <a
                  href={`/week?week=${cell.weekKey}#${cell.dayName.toLowerCase()}`}
                  class={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium transition-opacity hover:opacity-70',
                    cell.isToday
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : !cell.isCurrentMonth
                        ? 'text-[var(--text-faint)] opacity-40'
                        : 'text-[var(--text-faint)]'
                  ].join(' ')}
                  title={`Go to ${cell.dayName}, week of ${cell.weekKey}`}
                >
                  {cell.dateNum}
                </a>
              </div>

              <!-- Task drop zone -->
              <div
                use:dndzone={{
                  items: cell.tasks,
                  type: DND_TYPE,
                  flipDurationMs: FLIP_MS
                }}
                onconsider={(e) =>
                  handleConsider(cell.id, e as unknown as CustomEvent<DndEvent<TaskInstance>>)}
                onfinalize={(e) =>
                  handleFinalize(cell.id, e as unknown as CustomEvent<DndEvent<TaskInstance>>)}
                class="min-h-6 space-y-0.5"
              >
                {#each cell.tasks as task (task.id)}
                  <div
                    class={[
                      'group flex cursor-grab items-start gap-1 rounded-md px-1.5 py-1 text-[11px] leading-tight active:cursor-grabbing select-none',
                      task.status === 'done'
                        ? 'bg-transparent opacity-40'
                        : 'bg-[var(--panel-strong)]'
                    ].join(' ')}
                  >
                    <!-- Completion toggle -->
                    <button
                      class={[
                        'mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                        task.status === 'done'
                          ? 'border-[var(--text-muted)] bg-[var(--text-muted)]'
                          : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                      ].join(' ')}
                      onclick={(e) => {
                        e.stopPropagation();
                        void toggleTask(task);
                      }}
                      title={task.status === 'done' ? 'Mark open' : 'Mark done'}
                    >
                      {#if task.status === 'done'}
                        <svg
                          width="7"
                          height="7"
                          viewBox="0 0 7 7"
                          fill="none"
                          class="text-[var(--accent-contrast)]"
                        >
                          <path
                            d="M1 3.5L2.8 5.25L6 1.75"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      {/if}
                    </button>

                    <!-- Title + hours -->
                    <span
                      class={[
                        'min-w-0 flex-1 break-words',
                        task.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                      ].join(' ')}
                    >
                      {task.title_snapshot}
                    </span>
                    {#if task.hours_needed}
                      <span class="shrink-0 text-[9px] font-medium text-[var(--text-faint)]">{task.hours_needed}h</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- ── Unassigned tasks panel ── -->
    <div class="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-card)]">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-[10px] font-medium uppercase tracking-widest text-[var(--text-faint)]">
          Unassigned{unassigned.length > 0 ? ` · ${unassigned.length}` : ''}
        </div>
        <button
          onclick={() => (addingTask = !addingTask)}
          class={[
            'flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
            addingTask
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'border-[var(--border)] bg-[var(--panel-strong)] text-[var(--text-faint)] hover:text-[var(--text-primary)]'
          ].join(' ')}
          title="Add one-time task"
        >
          <Plus size={12} />
        </button>
      </div>

      {#if addingTask}
        <form
          onsubmit={(e) => { e.preventDefault(); void addInboxTask(); }}
          class="mb-3 flex gap-1.5"
        >
          <input
            type="text"
            bind:value={newTaskTitle}
            bind:this={quickAddInput}
            placeholder="Task title…"
            class="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
          <input
            type="number"
            bind:value={newTaskHours}
            placeholder="h"
            min="0.25"
            step="0.25"
            class="w-14 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newTaskTitle.trim()}
            class="rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Add
          </button>
        </form>
      {/if}

      <div
        use:dndzone={{
          items: unassigned,
          type: DND_TYPE,
          flipDurationMs: FLIP_MS
        }}
        onconsider={(e) =>
          handleUnassignedConsider(e as unknown as CustomEvent<DndEvent<TaskInstance>>)}
        onfinalize={(e) =>
          handleUnassignedFinalize(e as unknown as CustomEvent<DndEvent<TaskInstance>>)}
        class="min-h-8 space-y-1"
      >
        {#each unassigned as task (task.id)}
          {#if editingTaskId === task.id}
            <!-- Inline edit row — not draggable while editing -->
            <div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--panel-soft)] px-2 py-2 select-none">
              <div class="flex gap-1.5">
                <input
                  type="text"
                  bind:value={editTitle}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void saveEdit(task.id); }
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  class="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
                <input
                  type="number"
                  bind:value={editHours}
                  placeholder="h"
                  min="0.25"
                  step="0.25"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void saveEdit(task.id); }
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  class="w-14 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <div class="mt-1.5 flex items-center justify-between">
                <button
                  onclick={() => void deleteUnassignedTask(task.id)}
                  class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                >
                  <Trash2 size={10} />
                  Delete
                </button>
                <div class="flex gap-1">
                  <button
                    onclick={cancelEdit}
                    class="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <X size={10} />
                  </button>
                  <button
                    onclick={() => void saveEdit(task.id)}
                    disabled={!editTitle.trim()}
                    class="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-contrast)] disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <div
              class={[
                'group flex cursor-grab items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs active:cursor-grabbing select-none',
                task.status === 'done' ? 'opacity-40' : ''
              ].join(' ')}
            >
              <button
                class={[
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                  task.status === 'done'
                    ? 'border-[var(--text-muted)] bg-[var(--text-muted)]'
                    : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'
                ].join(' ')}
                onclick={(e) => { e.stopPropagation(); void toggleTask(task); }}
              >
                {#if task.status === 'done'}
                  <svg width="7" height="7" viewBox="0 0 7 7" fill="none" class="text-[var(--accent-contrast)]">
                    <path d="M1 3.5L2.8 5.25L6 1.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
              </button>
              <span
                class={[
                  'min-w-0 flex-1 truncate',
                  task.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                ].join(' ')}
              >
                {task.title_snapshot}
              </span>
              {#if task.hours_needed}
                <span class="shrink-0 text-[9px] font-medium text-[var(--text-faint)]">{task.hours_needed}h</span>
              {/if}
              <button
                onclick={(e) => { e.stopPropagation(); startEdit(task); }}
                class="ml-0.5 shrink-0 rounded p-0.5 text-[var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--text-primary)]"
                title="Edit"
              >
                <Pencil size={10} />
              </button>
            </div>
          {/if}
        {/each}
      </div>

      {#if unassigned.length === 0 && !addingTask}
        <p class="text-[11px] text-[var(--text-faint)]">
          No unassigned tasks — click <Plus size={10} class="inline" /> to add one.
        </p>
      {/if}
    </div>
  </div>
</div>
