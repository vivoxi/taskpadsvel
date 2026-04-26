<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { ChevronDown, ChevronLeft, ChevronRight, Archive } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import CapacitySummary from '$lib/components/CapacitySummary.svelte';
  import DayNoteEditor from '$lib/components/DayNoteEditor.svelte';
  import { apiSendJson } from '$lib/client/api';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import MetricCard from '$lib/components/ui/MetricCard.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import PanelCard from '$lib/components/ui/PanelCard.svelte';
  import TaskRow from '$lib/components/ui/TaskRow.svelte';
  import { DAY_NAMES, type PlannerBlock, type TaskInstance, type TasksByDay } from '$lib/planner/types';
  import { getNextWeekKey, getPreviousWeekKey } from '$lib/planner/dates';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let weeklyTasks = $state<TaskInstance[]>([]);
  let dayBuckets = $state<TasksByDay>({});
  let softAssignedTaskIds = $state<string[]>([]);
  let completedOpen = $state(false);

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
      <PageHeader title={data.view.label}>
        {#snippet actions()}
          <Button href={`/week?week=${getPreviousWeekKey(data.view.weekKey)}`} variant="secondary" size="sm">
            <ChevronLeft size={13} />
            Prev
          </Button>
          <Button href="/week" variant="secondary" size="sm">Today</Button>
          <Button href={`/week?week=${getNextWeekKey(data.view.weekKey)}`} variant="secondary" size="sm">
            Next
            <ChevronRight size={13} />
          </Button>
        {/snippet}
      </PageHeader>

      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Open" value={openTasks.length} />
        <MetricCard
          label="Days"
          value={DAY_NAMES.filter((dayName) => (dayBuckets[dayName] ?? []).length > 0).length}
        />
        <MetricCard label="Remaining" value={`${data.view.capacity.remaining_hours}h`} tone="accent" />
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
        <PanelCard title="Weekly pressure" eyebrow="Capacity">
          <CapacitySummary compact capacity={data.view.capacity} schedule={data.view.schedule} />
        </PanelCard>

        <PanelCard title="Unassigned" eyebrow="This week">
          <div class="space-y-2">
            {#if unassignedTasks.length === 0}
              <EmptyState
                compact
                title="Nothing floating"
                description="All open work is already parked on a day."
              />
            {:else}
              {#each unassignedTasks as task (task.id)}
                <TaskRow
                  task={task}
                  onToggle={() => toggleTask(task, 'done')}
                  onDelete={() => archiveTask(task)}
                />
              {/each}
            {/if}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Completed" title="Done">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            onclick={() => (completedOpen = !completedOpen)}
          >
            <span>{completedTasks.length} completed task{completedTasks.length === 1 ? '' : 's'}</span>
            <ChevronDown
              size={15}
              class={`transition-transform ${completedOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div class={`space-y-2 overflow-hidden transition-all ${completedOpen ? 'mt-3 max-h-[32rem]' : 'max-h-0'}`}>
            {#if completedTasks.length === 0}
              <EmptyState compact title="No completed items" description="Done work will collect here." />
            {:else}
              {#each completedTasks as task (task.id)}
                <TaskRow
                  task={task}
                  dimmed
                  onToggle={() => toggleTask(task, 'open')}
                />
              {/each}
            {/if}
          </div>
        </PanelCard>
      </aside>
    </div>
  </div>
</div>
