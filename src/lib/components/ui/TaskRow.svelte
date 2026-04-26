<script lang="ts">
  import { Check, Pencil, Trash2 } from 'lucide-svelte';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import type { TaskInstance } from '$lib/planner/types';

  let {
    task,
    compact = false,
    draggable = false,
    dimmed = false,
    showMeta = true,
    onToggle,
    onEdit,
    onDelete
  }: {
    task: TaskInstance;
    compact?: boolean;
    draggable?: boolean;
    dimmed?: boolean;
    showMeta?: boolean;
    onToggle?: (task: TaskInstance) => void | Promise<void>;
    onEdit?: (task: TaskInstance) => void;
    onDelete?: (task: TaskInstance) => void | Promise<void>;
  } = $props();
</script>

<div
  class={[
    'group flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-soft)] transition-colors hover:bg-[var(--panel)]',
    compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
    draggable ? 'cursor-grab active:cursor-grabbing select-none' : '',
    dimmed || task.status === 'done' ? 'opacity-60' : ''
  ].join(' ')}
>
  <button
    type="button"
    class={[
      'mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full border transition-colors',
      compact ? 'h-5 w-5' : 'h-6 w-6',
      task.status === 'done'
        ? 'border-[var(--success)] bg-[var(--success)] text-[var(--accent-contrast)]'
        : 'border-[var(--border-strong)] text-transparent hover:border-[var(--accent)]'
    ].join(' ')}
    onclick={() => onToggle?.(task)}
    aria-label={task.status === 'done' ? 'Mark task open' : 'Mark task done'}
  >
    {#if task.status === 'done'}
      <Check size={compact ? 11 : 12} />
    {/if}
  </button>

  <div class="min-w-0 flex-1">
    <div class={`text-sm leading-5 ${task.status === 'done' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
      {task.title_snapshot}
    </div>
    {#if showMeta}
      <div class="mt-1">
        <TaskMetaChips
          compact
          hours={task.hours_needed}
          sourceType={task.source_type}
          carried={task.carried_from_instance_id !== null}
        />
      </div>
    {/if}
  </div>

  {#if task.hours_needed && !showMeta}
    <span class="shrink-0 pt-0.5 text-[11px] text-[var(--text-faint)]">{task.hours_needed}h</span>
  {/if}

  {#if onEdit || onDelete}
    <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {#if onEdit}
        <button
          type="button"
          class="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
          onclick={() => onEdit(task)}
          aria-label="Edit task"
        >
          <Pencil size={13} />
        </button>
      {/if}
      {#if onDelete}
        <button
          type="button"
          class="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[rgba(239,68,68,0.12)] hover:text-[var(--danger)]"
          onclick={() => onDelete(task)}
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      {/if}
    </div>
  {/if}
</div>
