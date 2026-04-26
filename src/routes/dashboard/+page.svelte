<script lang="ts">
  import { browser } from '$app/environment';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    PanelRightClose,
    PanelRightOpen,
    Pencil,
    Plus,
    Trash2,
    X
  } from 'lucide-svelte';
  import MonthStrip from '$lib/components/MonthStrip.svelte';
  import PlannerSidePanel from '$lib/components/dashboard/PlannerSidePanel.svelte';
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
  const PLANNER_PANEL_MIN = 280;
  const PLANNER_PANEL_DEFAULT = 360;
  const PLANNER_PANEL_MAX = 520;

  let cells = $state<CalendarCell[]>([]);
  let unassigned = $state<TaskInstance[]>([]);
  let plannerPanelOpen = $state(true);
  let plannerPanelWidth = $state(PLANNER_PANEL_DEFAULT);
  let resizingPlannerPanel = $state(false);
  let desktopLayout = $state(false);
  let panelPrefsReady = false;

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

  onMount(() => {
    const syncDesktopMode = () => {
      desktopLayout = window.innerWidth >= 1280;
    };

    syncDesktopMode();

    const savedOpen = localStorage.getItem('taskpad-planner-panel-open');
    if (savedOpen === 'true' || savedOpen === 'false') {
      plannerPanelOpen = savedOpen === 'true';
    }

    const savedWidth = Number(localStorage.getItem('taskpad-planner-panel-width'));
    if (Number.isFinite(savedWidth)) {
      plannerPanelWidth = clampPlannerPanelWidth(savedWidth);
    }

    panelPrefsReady = true;
    window.addEventListener('resize', syncDesktopMode);

    return () => {
      window.removeEventListener('resize', syncDesktopMode);
      stopPlannerResize();
    };
  });

  $effect(() => {
    if (!browser || !panelPrefsReady) return;
    localStorage.setItem('taskpad-planner-panel-open', plannerPanelOpen ? 'true' : 'false');
    localStorage.setItem('taskpad-planner-panel-width', String(plannerPanelWidth));
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

  const desktopGridStyle = $derived(
    desktopLayout
      ? `grid-template-columns: minmax(0, 1fr) ${plannerPanelOpen ? `${plannerPanelWidth}px` : '0px'};`
      : ''
  );

  const desktopPlannerStyle = $derived(
    desktopLayout && !plannerPanelOpen
      ? 'width:0;min-width:0;opacity:0;pointer-events:none;overflow:hidden;'
      : ''
  );

  function clampPlannerPanelWidth(value: number) {
    return Math.min(PLANNER_PANEL_MAX, Math.max(PLANNER_PANEL_MIN, value));
  }

  function togglePlannerPanel() {
    plannerPanelOpen = !plannerPanelOpen;
  }

  function startPlannerResize(event: MouseEvent) {
    if (!desktopLayout || !plannerPanelOpen) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = plannerPanelWidth;
    resizingPlannerPanel = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      plannerPanelWidth = clampPlannerPanelWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      stopPlannerResize();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function stopPlannerResize() {
    if (!browser) return;
    resizingPlannerPanel = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
</script>

<div class="flex h-full flex-col">
  <!-- ── Header row 1: title + sequential nav ── -->
  <div
    class="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel-soft)] px-6 py-3"
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
        class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        aria-label="Previous month"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onclick={() => void goto('/dashboard')}
        class="h-7 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        Today
      </button>
      <button
        onclick={() => navMonth(1)}
        class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
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
    <div class="grid items-start gap-4 xl:gap-0" style={desktopGridStyle}>
      <div class="min-w-0">
        <div class="mb-4 xl:hidden">
          <div class="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-3 text-left"
              onclick={togglePlannerPanel}
            >
              <div>
                <div class="text-sm font-medium text-[var(--text-primary)]">Planner</div>
                <div class="mt-1 text-xs text-[var(--text-muted)]">
                  Templates, capacity, generate and reset
                </div>
              </div>
              <ChevronDown
                size={16}
                class={`text-[var(--text-faint)] transition-transform ${plannerPanelOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {#if plannerPanelOpen}
              <div class="border-t border-[var(--border)] p-3">
                <PlannerSidePanel
                  monthKey={data.view.monthKey}
                  templates={data.view.templates}
                  capacity={data.view.capacity}
                  schedule={data.view.schedule}
                />
              </div>
            {/if}
          </div>
        </div>

    <!-- Mobile list view (< sm) -->
    <div class="sm:hidden mb-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] divide-y divide-[var(--border)]">
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
                <div class="text-[11px] text-[var(--text-faint)]">
                  {cell.tasks.filter(t => t.status === 'done').length}/{cell.tasks.length} tasks
                </div>
              {:else}
                <div class="text-[11px] text-[var(--text-faint)]">No tasks</div>
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
    </div>

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
                'relative min-h-[7.5rem] border-r border-[var(--border)] p-1.5 last:border-r-0',
                cell.isToday ? 'bg-[var(--panel-strong)]' : '',
                !cell.isCurrentMonth ? 'bg-[var(--bg)]' : ''
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
                    style="
                      display:flex; align-items:center; gap:5px;
                      padding:3px 6px; border-radius:4px;
                      background:var(--panel-strong);
                      border-left:2px solid {task.status === 'done' ? 'var(--success)' : 'var(--accent)'};
                      font-size:11px; color:var(--text-secondary);
                      cursor:grab; user-select:none;
                      opacity:{task.status === 'done' ? '0.5' : '1'};
                    "
                    class="group active:cursor-grabbing select-none leading-tight"
                  >
                    <!-- Completion toggle -->
                    <button
                      style="
                        flex-shrink:0; width:8px; height:8px; border-radius:50%;
                        border:1px solid {task.status === 'done' ? 'var(--success)' : 'var(--border-strong)'};
                        background:{task.status === 'done' ? 'var(--success)' : 'transparent'};
                        cursor:pointer; padding:0;
                      "
                      onclick={(e) => {
                        e.stopPropagation();
                        void toggleTask(task);
                      }}
                      title={task.status === 'done' ? 'Mark open' : 'Mark done'}
                    ></button>

                    <!-- Title -->
                    <span
                      style="min-width:0;flex:1;word-break:break-words;{task.status === 'done' ? 'text-decoration:line-through;color:var(--text-faint)' : ''}"
                    >
                      {task.title_snapshot}
                    </span>
                    {#if task.hours_needed}
                      <span style="flex-shrink:0;font-size:9px;color:var(--text-faint)">{task.hours_needed}h</span>
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
    <div class="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
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

      <div class="relative hidden xl:block">
        {#if plannerPanelOpen}
          <button
            type="button"
            class={`absolute left-0 top-1/2 z-10 h-24 w-3 -translate-x-1/2 -translate-y-1/2 cursor-col-resize rounded-full border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)] ${resizingPlannerPanel ? 'text-[var(--accent)]' : ''}`}
            onmousedown={startPlannerResize}
            aria-label="Resize planner panel"
          ></button>
        {/if}

        <div class="min-w-0 xl:pl-4" style={desktopPlannerStyle}>
          <div class="mb-3 flex items-center justify-end">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              onclick={togglePlannerPanel}
            >
              <PanelRightClose size={14} />
              Collapse
            </button>
          </div>

          <div class="xl:sticky xl:top-4">
            <PlannerSidePanel
              monthKey={data.view.monthKey}
              templates={data.view.templates}
              capacity={data.view.capacity}
              schedule={data.view.schedule}
              compact
            />
          </div>
        </div>
      </div>
    </div>

    {#if desktopLayout && !plannerPanelOpen}
      <button
        type="button"
        class="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-2 rounded-l-full rounded-r-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition-colors hover:text-[var(--text-primary)] xl:inline-flex"
        onclick={togglePlannerPanel}
      >
        <PanelRightOpen size={15} />
        Planner
      </button>
    {/if}
  </div>
</div>
