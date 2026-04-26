<script lang="ts">
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import PanelCard from '$lib/components/ui/PanelCard.svelte';
  import TaskRow from '$lib/components/ui/TaskRow.svelte';
  import type { DayName, PlannerBlock, TaskInstance } from '$lib/planner/types';

  let {
    weekKey,
    isoDate,
    dayName,
    dateLabel,
    isToday = false,
    blocks,
    tasks,
    onSaveBlocks,
    onToggleTask
  }: {
    weekKey: string;
    isoDate: string;
    dayName: DayName;
    dateLabel: string;
    isToday?: boolean;
    blocks: PlannerBlock[];
    tasks: TaskInstance[];
    onSaveBlocks: (dayName: DayName, blocks: PlannerBlock[]) => void | Promise<void>;
    onToggleTask: (task: TaskInstance, nextStatus: 'open' | 'done') => void | Promise<void>;
  } = $props();

  const hasTasks = $derived(tasks.length > 0);
  const hasBlocks = $derived(blocks.length > 0);
</script>

<PanelCard padded={false} className={isToday ? 'border-[var(--accent)]/35' : ''}>
  <div class="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
    <div class="flex items-baseline gap-2">
      <h2 class="text-sm font-medium text-[var(--text-primary)]">{dayName}</h2>
      <span class="text-xs text-[var(--text-faint)]">{dateLabel}</span>
    </div>
    {#if isToday}
      <Badge tone="accent">Today</Badge>
    {/if}
  </div>

  <div class="px-5 py-4">
    {#if hasTasks}
      <div class="space-y-2">
        {#each tasks as task (task.id)}
          <TaskRow
            task={task}
            onToggle={() => onToggleTask(task, task.status === 'done' ? 'open' : 'done')}
          />
        {/each}
      </div>
    {/if}

    {#if hasTasks && hasBlocks}
      <hr class="my-3 border-zinc-100 dark:border-zinc-800" />
    {/if}

    <BlockEditor
      sourceKey={`${weekKey}:${dayName}`}
      blocks={blocks}
      compact
      emptyLabel="Add a note, header, or checklist item"
      onCommit={(nextBlocks) => onSaveBlocks(dayName, nextBlocks)}
    />
  </div>
</PanelCard>
