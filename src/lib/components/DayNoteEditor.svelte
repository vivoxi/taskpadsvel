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

<article style="border-radius:8px;border:1px solid var(--border);background:var(--panel);padding:16px 20px">
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:12px">
    <div style="display:flex;align-items:baseline;gap:8px">
      <h2 style="font-size:14px;font-weight:500;color:var(--text-primary);margin:0">{dayName}</h2>
      <span style="font-size:12px;color:var(--text-faint)">{dateLabel}</span>
    </div>
    {#if isToday}
      <span style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--accent);background:var(--accent-subtle);padding:2px 8px;border-radius:4px">Today</span>
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
                ? 'border-[var(--success)] bg-[var(--success)]'
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
                hours={task.hours_needed}
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
