<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiSendJson } from '$lib/client/api';
  import { DAY_NAMES, type PlannerBlock, type TaskInstance } from '$lib/planner/types';
  import {
    formatDayChip,
    getNextWeekKey,
    getPreviousWeekKey
  } from '$lib/planner/dates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let tasks = $state<TaskInstance[]>([]);

  $effect(() => {
    data.view.weekKey;
    tasks = structuredClone(data.view.tasks);
  });

  function taskSort(left: TaskInstance, right: TaskInstance) {
    const leftDayIndex = left.day_name ? DAY_NAMES.indexOf(left.day_name) : Number.MAX_SAFE_INTEGER;
    const rightDayIndex = right.day_name ? DAY_NAMES.indexOf(right.day_name) : Number.MAX_SAFE_INTEGER;

    return (
      leftDayIndex - rightDayIndex ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  }

  const completedTasks = $derived(tasks.filter((task) => task.status === 'done').sort(taskSort));
  const openTasks = $derived(tasks.filter((task) => task.status === 'open').sort(taskSort));
  const todayTasks = $derived(
    data.view.isCurrentWeek && data.view.todayDayName
      ? openTasks.filter((task) => task.day_name === data.view.todayDayName)
      : []
  );
  const laterTasks = $derived(
    data.view.isCurrentWeek && data.view.todayDayName
      ? openTasks.filter((task) => task.day_name !== data.view.todayDayName)
      : openTasks
  );

  async function toggleTask(taskId: string, nextStatus: 'open' | 'done') {
    const previousTasks = structuredClone(tasks);
    tasks = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: nextStatus,
            completed_at: nextStatus === 'done' ? new Date().toISOString() : null
          }
        : task
    );

    try {
      await apiSendJson(`/api/task-instances/${taskId}`, 'PATCH', {
        status: nextStatus
      });
    } catch (error) {
      tasks = previousTasks;
      toast.error(error instanceof Error ? error.message : 'Failed to update task');
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

<div class="px-4 py-4 sm:px-6 sm:py-6">
  <div class="mx-auto flex max-w-[1400px] flex-col gap-6">
    <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-soft)] sm:px-7 sm:py-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <p class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Weekly workspace</p>
          <h1 class="text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
            {data.view.label}
          </h1>
          <p class="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            Daily notes live beside the work itself, and past weeks stay editable like any other working record.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <a
            href={`/week?week=${getPreviousWeekKey(data.view.weekKey)}`}
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={16} />
            Previous
          </a>
          <a
            href="/week"
            class="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Current week
          </a>
          <a
            href={`/week?week=${getNextWeekKey(data.view.weekKey)}`}
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Next
            <ChevronRight size={16} />
          </a>
        </div>
      </div>

      <div class="mt-6 grid gap-3 sm:grid-cols-3">
        <div class="rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
          <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Open work</div>
          <div class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {openTasks.length}
          </div>
          <div class="mt-1 text-sm text-[var(--text-muted)]">Still in motion this week</div>
        </div>
        <div class="rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
          <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Completed</div>
          <div class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {completedTasks.length}
          </div>
          <div class="mt-1 text-sm text-[var(--text-muted)]">Marked done and still editable</div>
        </div>
        <div class="rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
          <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Month context</div>
          <div class="mt-3 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {data.view.monthKey}
          </div>
          <div class="mt-1 text-sm text-[var(--text-muted)]">This week belongs to the selected planning month</div>
        </div>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
      <section class="space-y-4">
        {#each data.view.days as day}
          <article class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)] sm:px-6">
            <div class="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  {day.isoDate}
                </div>
                <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {day.dayName}
                </h2>
                <p class="mt-1 text-sm text-[var(--text-muted)]">{day.dateLabel}</p>
              </div>

              {#if data.view.todayDayName === day.dayName}
                <div class="rounded-full border border-[var(--border-strong)] bg-[var(--panel-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Today
                </div>
              {/if}
            </div>

            <div class="pt-4">
              <BlockEditor
                sourceKey={`${data.view.weekKey}:${day.dayName}`}
                blocks={day.blocks}
                compact
                emptyLabel="Add a note, header, or checklist item"
                onCommit={(blocks) => saveDayBlocks(day.dayName, blocks)}
              />
            </div>
          </article>
        {/each}
      </section>

      <aside class="space-y-4 xl:sticky xl:top-6 xl:self-start">
        {#if data.view.isCurrentWeek}
          <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)]">
            <div class="border-b border-[var(--border)] pb-4">
              <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Today</div>
              <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                {data.view.todayDayName ?? 'No day selected'}
              </h2>
            </div>

            <div class="space-y-2 pt-4">
              {#if todayTasks.length === 0}
                <p class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  Nothing assigned for today.
                </p>
              {:else}
                {#each todayTasks as task (task.id)}
                  <button
                    type="button"
                    class="flex w-full items-start gap-3 rounded-[18px] border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--panel-soft)]"
                    onclick={() => toggleTask(task.id, 'done')}
                  >
                    <span class="mt-1 h-4 w-4 rounded-full border border-[var(--border-strong)]"></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-[var(--text-primary)]">{task.title_snapshot}</span>
                      <span class="mt-1 block text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {task.day_name ? formatDayChip(data.view.weekKey, task.day_name) : 'Unassigned'}
                      </span>
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
          </section>
        {/if}

        <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)]">
          <div class="border-b border-[var(--border)] pb-4">
            <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              {data.view.isCurrentWeek ? 'This week' : 'Open work'}
            </div>
            <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              {data.view.isCurrentWeek ? 'Remaining' : 'Still open'}
            </h2>
          </div>

          <div class="space-y-2 pt-4">
            {#if laterTasks.length === 0}
              <p class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                No open tasks here.
              </p>
            {:else}
              {#each laterTasks as task (task.id)}
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--panel-soft)]"
                  onclick={() => toggleTask(task.id, 'done')}
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-[var(--text-primary)]">{task.title_snapshot}</span>
                    <span class="mt-1 block text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {task.day_name ? formatDayChip(data.view.weekKey, task.day_name) : 'Unassigned'}
                    </span>
                  </span>
                  <span class="mt-1 h-4 w-4 rounded-full border border-[var(--border-strong)]"></span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)]">
          <div class="border-b border-[var(--border)] pb-4">
            <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Completed</div>
            <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Done and revisitable</h2>
          </div>

          <div class="space-y-2 pt-4">
            {#if completedTasks.length === 0}
              <p class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                No completed items yet.
              </p>
            {:else}
              {#each completedTasks as task (task.id)}
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)]/70 px-4 py-3 text-left opacity-80 transition-colors hover:opacity-100"
                  onclick={() => toggleTask(task.id, 'open')}
                >
                  <span class="min-w-0">
                    <span class="block text-sm text-[var(--text-muted)] line-through">{task.title_snapshot}</span>
                    <span class="mt-1 block text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {task.day_name ? formatDayChip(data.view.weekKey, task.day_name) : 'Unassigned'}
                    </span>
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
