<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import DayNoteEditor from '$lib/components/DayNoteEditor.svelte';
  import { apiSendJson } from '$lib/client/api';
  import { DAY_NAMES, type PlannerBlock } from '$lib/planner/types';
  import { getNextWeekKey, getPreviousWeekKey } from '$lib/planner/dates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function taskSort(left: PageData['view']['tasks'][number], right: PageData['view']['tasks'][number]) {
    const leftDayIndex = left.day_name ? DAY_NAMES.indexOf(left.day_name) : Number.MAX_SAFE_INTEGER;
    const rightDayIndex = right.day_name ? DAY_NAMES.indexOf(right.day_name) : Number.MAX_SAFE_INTEGER;

    return (
      leftDayIndex - rightDayIndex ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  }

  const completedTasks = $derived(data.view.tasks.filter((task) => task.status === 'done').sort(taskSort));
  const openTasks = $derived(data.view.tasks.filter((task) => task.status === 'open').sort(taskSort));
  const unassignedTasks = $derived(openTasks.filter((task) => task.day_name === null));

  async function toggleSideTask(taskId: string, nextStatus: 'open' | 'done') {
    try {
      await apiSendJson(`/api/task-instances/${taskId}`, 'PATCH', {
        status: nextStatus
      });
      await invalidateAll();
    } catch (error) {
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
          <DayNoteEditor
            weekKey={data.view.weekKey}
            isoDate={day.isoDate}
            dayName={day.dayName}
            dateLabel={day.dateLabel}
            isToday={data.view.todayDayName === day.dayName}
            tasks={data.byDay[day.dayName] ?? []}
            blocks={day.blocks}
            onSaveBlocks={saveDayBlocks}
          />
        {/each}
      </section>

      <aside class="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)]">
          <div class="border-b border-[var(--border)] pb-4">
            <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">This week</div>
            <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              Unassigned this week
            </h2>
          </div>

          <div class="space-y-2 pt-4">
            {#if unassignedTasks.length === 0}
              <p class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                No unassigned tasks for this week.
              </p>
            {:else}
              {#each unassignedTasks as task (task.id)}
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-3 rounded-[18px] border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--panel-soft)]"
                  onclick={() => toggleSideTask(task.id, 'done')}
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-[var(--text-primary)]">{task.title_snapshot}</span>
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
                  onclick={() => toggleSideTask(task.id, 'open')}
                >
                  <span class="min-w-0">
                    <span class="block text-sm text-[var(--text-muted)] line-through">{task.title_snapshot}</span>
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
