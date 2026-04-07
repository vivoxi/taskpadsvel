<script lang="ts">
  import { Check } from 'lucide-svelte';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
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

<article class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)] sm:px-6">
  <div class="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
    <div>
      <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
        {isoDate}
      </div>
      <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
        {dayName}
      </h2>
      <p class="mt-1 text-sm text-[var(--text-muted)]">{dateLabel}</p>
    </div>

    {#if isToday}
      <div class="rounded-full border border-[var(--border-strong)] bg-[var(--panel-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Today
      </div>
    {/if}
  </div>

  <div class="pt-4">
    {#if hasTasks}
      <div class="space-y-0.5">
        {#each tasks as task (task.id)}
          <button
            type="button"
            class="flex w-full items-start gap-3 rounded-[16px] py-2 text-left text-sm transition-colors hover:bg-[var(--panel-soft)]/70"
            onclick={() => onToggleTask(task, task.status === 'done' ? 'open' : 'done')}
          >
            <span class={`mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border ${
              task.status === 'done'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'border-[var(--border-strong)] text-transparent'
            }`}>
              {#if task.status === 'done'}
                <Check size={11} />
              {/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class={`block ${task.status === 'done' ? 'text-zinc-400 line-through' : 'text-[var(--text-primary)]'}`}>
                {task.title_snapshot}
              </span>
              <TaskMetaChips
                compact
                priority={task.priority}
                dueDate={task.due_date}
                hours={task.hours_needed}
                category={task.category}
                sourceType={task.source_type}
                carried={task.carried_from_instance_id !== null}
              />
            </span>
          </button>
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
</article>
