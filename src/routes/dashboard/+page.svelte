<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    Trash2,
    X
  } from 'lucide-svelte';
  import MonthStrip from '$lib/components/MonthStrip.svelte';
  import PlannerSidePanel from '$lib/components/dashboard/PlannerSidePanel.svelte';
  import ResizablePlannerPanel from '$lib/components/dashboard/ResizablePlannerPanel.svelte';
  import { toast } from 'svelte-sonner';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { isSameDay } from 'date-fns';
  import { apiSendJson } from '$lib/client/api';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import MetricCard from '$lib/components/ui/MetricCard.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import PanelCard from '$lib/components/ui/PanelCard.svelte';
  import TaskRow from '$lib/components/ui/TaskRow.svelte';
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
  let addingToCellId = $state<string | null>(null);

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

  async function addTaskToCell(cell: CalendarCell) {
    addingToCellId = cell.id;

    try {
      const result = await apiSendJson<{ instance: TaskInstance }>('/api/task-instances', 'POST', {
        title: 'New task',
        monthKey: data.view.monthKey,
        hoursNeeded: null
      });

      const instance = result.instance;
      await apiSendJson(`/api/task-instances/${instance.id}`, 'PATCH', {
        week_key: cell.weekKey,
        day_name: cell.dayName,
        existing_month_key: data.view.monthKey,
        existing_week_key: null
      });

      await invalidateAll();
    } catch {
      toast.error('Failed to add task');
    } finally {
      addingToCellId = null;
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

<svelte:head>
  <title>Calendar · Taskpad</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="shrink-0 border-b border-[var(--border)] bg-[var(--panel-soft)] px-6 py-4">
    <PageHeader title={data.view.label} meta={totalTasks > 0 ? `${doneTasks}/${totalTasks} done` : ''}>
      {#snippet actions()}
        <Button variant="icon" size="sm" onclick={() => navMonth(-1)} ariaLabel="Previous month">
          <ChevronLeft size={14} />
        </Button>
        <Button variant="secondary" size="sm" onclick={() => void goto('/dashboard')}>Today</Button>
        <Button variant="icon" size="sm" onclick={() => navMonth(1)} ariaLabel="Next month">
          <ChevronRight size={15} />
        </Button>
      {/snippet}
    </PageHeader>
  </div>

  <!-- ── Header row 2: year/month strip ── -->
  <MonthStrip monthKey={data.view.monthKey} basePath="/dashboard" />

  <!-- ── Calendar ── -->
  <div class="flex-1 overflow-auto p-4 md:p-6">
    <ResizablePlannerPanel title="Planner">
      {#snippet main()}
    <!-- Mobile list view (< sm) -->
    <PanelCard padded={false} className="mb-4 overflow-hidden sm:hidden">
      {#each data.view.weeks as week, wi (week.weekKey)}
        {@const weekCells = cells.slice(wi * 7, wi * 7 + 7).filter(c => c.isCurrentMonth || c.tasks.length > 0)}
        {#each weekCells as cell (cell.id)}
          <a
            href={`/week?week=${cell.weekKey}#${cell.dayName.toLowerCase()}`}
            class={[
              'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--panel-soft)]',
              !cell.isCurrentMonth ? 'opacity-40' : ''
            ].join(' ')}
          >
            <div class={[
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
              cell.isToday ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-faint)]'
            ].join(' ')}>
              {cell.dateNum}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-medium text-[var(--text-secondary)]">{cell.dayName}</div>
              {#if cell.tasks.length > 0}
                <div class="mt-0.5 text-[11px] text-[var(--text-faint)]">
                  {cell.tasks.filter(t => t.status === 'done').length}/{cell.tasks.length} complete
                </div>
              {:else}
                <div class="mt-0.5 text-[11px] text-[var(--text-faint)]">No tasks yet</div>
              {/if}
            </div>
            {#if cell.tasks.length > 0}
              <div class="flex shrink-0 flex-wrap justify-end gap-1">
                {#each cell.tasks.slice(0, 3) as task (task.id)}
                  <span class={[
                    'max-w-[7rem] truncate rounded-md px-1.5 py-0.5 text-[10px]',
                    task.status === 'done' ? 'bg-transparent text-[var(--text-faint)] line-through' : 'bg-[var(--panel-strong)] text-[var(--text-secondary)]'
                  ].join(' ')}>{task.title_snapshot}</span>
                {/each}
                {#if cell.tasks.length > 3}
                  <span class="text-[10px] text-[var(--text-faint)]">+{cell.tasks.length - 3}</span>
                {/if}
              </div>
            {/if}
          </a>
        {/each}
      {/each}
    </PanelCard>

    <!-- Desktop grid view (>= sm) -->
    <div class="hidden sm:block rounded-lg border border-[var(--border)] bg-[var(--panel)] overflow-hidden">

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
                'group relative min-h-[8rem] border-r border-[var(--border)] p-2 last:border-r-0',
                cell.isToday ? 'bg-[var(--panel-strong)]' : '',
                !cell.isCurrentMonth ? 'bg-[var(--bg)]' : ''
              ].join(' ')}
            >
              <div class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="!gap-1 !px-2 !py-1 text-[11px]"
                  onclick={() => void addTaskToCell(cell)}
                  disabled={addingToCellId === cell.id}
                  title={`Add task to ${cell.dayName}`}
                >
                  <Plus size={12} />
                  {addingToCellId === cell.id ? 'Adding' : 'Add'}
                </Button>
              </div>

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
                class="min-h-6 space-y-1"
              >
                {#each cell.tasks as task (task.id)}
                  <TaskRow
                    task={task}
                    compact
                    draggable
                    showMeta={false}
                    onToggle={() => void toggleTask(task)}
                  />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- ── Unassigned tasks panel ── -->
    <PanelCard title="Inbox" eyebrow="Unassigned" className="mt-4">
      <div class="mb-3 flex items-center justify-between">
        <Badge>{unassigned.length} task{unassigned.length === 1 ? '' : 's'}</Badge>
        <Button
          variant={addingTask ? 'primary' : 'secondary'}
          size="sm"
          onclick={() => (addingTask = !addingTask)}
          title="Add one-time task"
        >
          <Plus size={12} />
          Add task
        </Button>
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
          <Button type="submit" variant="secondary" size="sm" disabled={!newTaskTitle.trim()}>
            Add
          </Button>
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
                  class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] transition-colors hover:bg-[rgba(220,38,38,0.1)] hover:text-[var(--danger)]"
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
            <TaskRow
              task={task}
              compact
              draggable
              showMeta={false}
              onToggle={() => void toggleTask(task)}
              onEdit={() => startEdit(task)}
            />
          {/if}
        {/each}
      </div>

      {#if unassigned.length === 0 && !addingTask}
        <EmptyState
          compact
          title="Inbox is clear"
          description="New one-off tasks land here before you place them on a day."
        />
      {/if}
    </PanelCard>
      {/snippet}
      {#snippet panel()}
        <PlannerSidePanel
          monthKey={data.view.monthKey}
          templates={data.view.templates}
          capacity={data.view.capacity}
          schedule={data.view.schedule}
          compact
        />
      {/snippet}
      {#snippet mobilePanel()}
        <PlannerSidePanel
          monthKey={data.view.monthKey}
          templates={data.view.templates}
          capacity={data.view.capacity}
          schedule={data.view.schedule}
        />
      {/snippet}
    </ResizablePlannerPanel>
  </div>
</div>
