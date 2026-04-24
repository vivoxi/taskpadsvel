<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { ChevronLeft, ChevronRight, Archive } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import CapacitySummary from '$lib/components/CapacitySummary.svelte';
  import DayNoteEditor from '$lib/components/DayNoteEditor.svelte';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import { apiSendJson } from '$lib/client/api';
  import { DAY_NAMES, type PlannerBlock, type TaskInstance, type TasksByDay } from '$lib/planner/types';
  import { getNextWeekKey, getPreviousWeekKey } from '$lib/planner/dates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let weeklyTasks = $state<TaskInstance[]>([]);
  let dayBuckets = $state<TasksByDay>({});
  let softAssignedTaskIds = $state<string[]>([]);

  $effect(() => {
    weeklyTasks = structuredClone(data.view.tasks);
    dayBuckets = structuredClone(data.byDay);
    softAssignedTaskIds = structuredClone(data.view.softAssignedTaskIds);
  });

  // Scroll to the day anchor when navigating from the calendar view
  $effect(() => {
    const hash = $page.url.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function taskSort(left: PageData['view']['tasks'][number], right: PageData['view']['tasks'][number]) {
    const leftDayIndex = left.day_name ? DAY_NAMES.indexOf(left.day_name) : Number.MAX_SAFE_INTEGER;
    const rightDayIndex = right.day_name ? DAY_NAMES.indexOf(right.day_name) : Number.MAX_SAFE_INTEGER;

    return (
      leftDayIndex - rightDayIndex ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  }

  function updateTaskLocal(taskId: string, updater: (task: TaskInstance) => TaskInstance) {
    weeklyTasks = weeklyTasks.map((task) => (task.id === taskId ? updater(task) : task));
    const nextBuckets: TasksByDay = {};

    for (const dayName of Object.keys(dayBuckets) as (keyof TasksByDay)[]) {
      nextBuckets[dayName] = (dayBuckets[dayName] ?? []).map((task) =>
        task.id === taskId ? updater(task) : task
      );
    }

    dayBuckets = nextBuckets;
  }

  const visibleTasks = $derived.by(() => {
    const merged = [...weeklyTasks, ...Object.values(dayBuckets).flat()];
    const seen = new Set<string>();
    return merged.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  });
  const completedTasks = $derived(visibleTasks.filter((task) => task.status === 'done').sort(taskSort));
  const openTasks = $derived(visibleTasks.filter((task) => task.status === 'open' && task.archived_at === null).sort(taskSort));
  const unassignedTasks = $derived(
    weeklyTasks
      .filter(
        (task) =>
          task.status === 'open' &&
          task.day_name === null &&
          task.archived_at === null &&
          !softAssignedTaskIds.includes(task.id)
      )
      .sort(taskSort)
  );

  async function toggleTask(task: TaskInstance, nextStatus: 'open' | 'done', enableUndo = true) {
    const previousStatus = task.status;
    updateTaskLocal(task.id, (entry) => ({
      ...entry,
      status: nextStatus,
      completed_at: nextStatus === 'done' ? new Date().toISOString() : null
    }));

    try {
      await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', {
        status: nextStatus
      });
      if (enableUndo) {
        toast(nextStatus === 'done' ? 'Task completed' : 'Task reopened', {
          action: {
            label: 'Undo',
            onClick: () => void toggleTask({ ...task, status: nextStatus }, previousStatus, false)
          }
        });
      }
      await invalidateAll();
    } catch (error) {
      updateTaskLocal(task.id, (entry) => ({
        ...entry,
        status: previousStatus,
        completed_at: previousStatus === 'done' ? entry.completed_at : null
      }));
      toast.error(error instanceof Error ? error.message : 'Failed to update task');
    }
  }

  async function archiveTask(task: TaskInstance) {
    updateTaskLocal(task.id, (entry) => ({
      ...entry,
      archived_at: new Date().toISOString()
    }));

    try {
      await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', {
        archived_at: new Date().toISOString()
      });
      toast('Task archived', {
        action: {
          label: 'Undo',
          onClick: async () => {
            await apiSendJson(`/api/task-instances/${task.id}`, 'PATCH', {
              archived_at: null
            });
            await invalidateAll();
          }
        }
      });
      await invalidateAll();
    } catch (error) {
      updateTaskLocal(task.id, (entry) => ({
        ...entry,
        archived_at: null
      }));
      toast.error(error instanceof Error ? error.message : 'Failed to archive task');
    }
  }

  async function saveDayBlocks(dayName: string, blocks: PlannerBlock[]) {
    try {
      await apiSendJson('/api/weekly-notes', 'POST', {
        weekKey: data.view.weekKey,
        dayName,
        blocks
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save notes');
    }
  }
</script>

<svelte:head>
  <title>Week · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto flex max-w-[1400px] flex-col gap-5">
    <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4 sm:px-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="text-base font-medium tracking-[-0.02em] text-[var(--text-primary)]">
          {data.view.label}
        </h1>

        <div class="flex items-center gap-1.5">
          <a
            href={`/week?week=${getPreviousWeekKey(data.view.weekKey)}`}
            class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={13} />
            Prev
          </a>
          <a
            href="/week"
            class="inline-flex items-center rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Today
          </a>
          <a
            href={`/week?week=${getNextWeekKey(data.view.weekKey)}`}
            class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Next
            <ChevronRight size={13} />
          </a>
        </div>
      </div>

      <div class="mt-4" style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-radius:6px;overflow:hidden">
        <div style="background:var(--panel-soft);padding:10px 12px">
          <div style="font-size:10px;color:var(--text-faint);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Open</div>
          <div style="font-size:18px;font-weight:500;color:var(--text-primary)">{openTasks.length}</div>
        </div>
        <div style="background:var(--panel-soft);padding:10px 12px">
          <div style="font-size:10px;color:var(--text-faint);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Days</div>
          <div style="font-size:18px;font-weight:500;color:var(--text-primary)">{DAY_NAMES.filter((dayName) => (dayBuckets[dayName] ?? []).length > 0).length}</div>
        </div>
        <div style="background:var(--panel-soft);padding:10px 12px">
          <div style="font-size:10px;color:var(--text-faint);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Remaining</div>
          <div style="font-size:18px;font-weight:500;color:var(--text-primary)">{data.view.capacity.remaining_hours}h</div>
        </div>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
      <section class="space-y-4">
        {#each data.view.days as day}
          <div id={day.dayName.toLowerCase()}>
            <DayNoteEditor
              weekKey={data.view.weekKey}
              isoDate={day.isoDate}
              dayName={day.dayName}
              dateLabel={day.dateLabel}
              isToday={data.view.todayDayName === day.dayName}
              tasks={dayBuckets[day.dayName] ?? []}
              blocks={day.blocks}
              onSaveBlocks={saveDayBlocks}
              onToggleTask={toggleTask}
            />
          </div>
        {/each}
      </section>

      <aside class="space-y-3.5 xl:sticky xl:top-6 xl:self-start">
        <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
          <div class="border-b border-[var(--border)] pb-3">
            <div class="text-[10px] uppercase tracking-[0.05em] text-[var(--text-faint)]">Capacity</div>
            <h2 class="mt-1 text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">Weekly pressure</h2>
          </div>

          <div class="pt-3">
            <CapacitySummary compact capacity={data.view.capacity} schedule={data.view.schedule} />
          </div>
        </section>

        <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
          <div class="border-b border-[var(--border)] pb-3">
            <div class="text-[10px] uppercase tracking-[0.05em] text-[var(--text-faint)]">This week</div>
            <h2 class="mt-1 text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">Unassigned</h2>
          </div>

          <div class="space-y-2 pt-3">
            {#if unassignedTasks.length === 0}
              <p class="rounded-[16px] border border-dashed border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
                No unassigned tasks for this week.
              </p>
            {:else}
              {#each unassignedTasks as task (task.id)}
                <div class="flex items-start justify-between gap-3 rounded-[16px] border border-[var(--border)] px-3.5 py-2.5 transition-colors hover:bg-[var(--panel-soft)]">
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-[var(--text-primary)]">{task.title_snapshot}</span>
                    <TaskMetaChips
                      compact
                      hours={task.hours_needed}
                      sourceType={task.source_type}
                    />
                  </span>
                  <span class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      onclick={() => toggleTask(task, 'done')}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-[var(--border)] p-1 text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
                      onclick={() => archiveTask(task)}
                    >
                      <Archive size={12} />
                    </button>
                  </span>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
          <div class="border-b border-[var(--border)] pb-3">
            <div class="text-[10px] uppercase tracking-[0.05em] text-[var(--text-faint)]">Completed</div>
            <h2 class="mt-1 text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">Done</h2>
          </div>

          <div class="space-y-2 pt-3">
            {#if completedTasks.length === 0}
              <p class="rounded-[16px] border border-dashed border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
                No completed items yet.
              </p>
            {:else}
              {#each completedTasks as task (task.id)}
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--panel-soft)]/70 px-3.5 py-2.5 text-left opacity-80 transition-colors hover:opacity-100"
                  onclick={() => toggleTask(task, 'open')}
                >
                  <span class="min-w-0">
                    <span class="block text-sm text-[var(--text-muted)] line-through">{task.title_snapshot}</span>
                    <TaskMetaChips
                      compact
                      hours={task.hours_needed}
                      sourceType={task.source_type}
                      carried={task.carried_from_instance_id !== null}
                    />
                  </span>
                  <span class="mt-1 h-4 w-4 rounded-full border border-[var(--border-strong)] bg-[var(--accent)]"></span>
                </button>
              {/each}
            {/if}
          </div>
        </section>
      </aside>
    </div>
  </div>
</div>
