<script lang="ts">
  import AttachmentChip from '$lib/components/AttachmentChip.svelte';
  import type { PersistedPeriodTaskInstance } from '$lib/periodInstances';
  import type { TaskAttachment } from '$lib/types';

  let {
    instance,
    completed = false,
    transitioning = false,
    attachments = [],
    showSource = true,
    showCheck = true,
    onToggle = () => {},
    sourceLabel = ''
  }: {
    instance: PersistedPeriodTaskInstance;
    completed?: boolean;
    transitioning?: boolean;
    attachments?: TaskAttachment[];
    showSource?: boolean;
    showCheck?: boolean;
    onToggle?: (instance: PersistedPeriodTaskInstance) => void;
    sourceLabel?: string;
  } = $props();
</script>

<button
  type="button"
  onclick={() => onToggle(instance)}
  class={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-300 ${
    transitioning ? 'opacity-40' : completed ? 'opacity-40' : 'opacity-100'
  } ${
    completed
      ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-950/15'
      : instance.period_type === 'monthly'
        ? 'border-sky-200 bg-sky-50/70 dark:border-sky-500/20 dark:bg-sky-950/15'
        : 'border-violet-200 bg-violet-50/70 dark:border-violet-500/20 dark:bg-violet-950/15'
  }`}
>
  {#if showCheck}
    <span
      class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        completed
          ? 'border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400'
          : 'border-zinc-300 dark:border-zinc-600'
      }`}
    >
      {#if completed}
        <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
          <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      {/if}
    </span>
  {/if}
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <span class="font-mono text-[10px] uppercase text-zinc-400">
        [{instance.period_type}]
      </span>
      <span class={`text-sm font-medium ${
        completed ? 'text-zinc-400 line-through' : 'text-zinc-900 dark:text-zinc-100'
      }`}>
        {instance.title}
      </span>
      {#if showSource && sourceLabel}
        <span class="ml-auto text-xs text-zinc-600 dark:text-zinc-500">
          ↩ {sourceLabel}
        </span>
      {/if}
    </div>
    <div class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
      {instance.estimated_hours ?? 1}h
    </div>
    {#if attachments.length > 0}
      <div class="mt-2 flex flex-wrap gap-2">
        {#each attachments as attachment (attachment.id)}
          <AttachmentChip
            {attachment}
            readonly={true}
            onDelete={() => {}}
          />
        {/each}
      </div>
    {/if}
  </div>
</button>
