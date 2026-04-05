<script lang="ts">
  import ThisWeekInstanceButton from '$lib/components/ThisWeekInstanceButton.svelte';
  import type { PersistedPeriodTaskInstance } from '$lib/periodInstances';
  import type { TaskAttachment } from '$lib/types';

  let {
    day,
    dateLabel = '',
    isToday = false,
    activeInstances = [],
    completedInstances = [],
    sourceLabelFor = () => '',
    attachmentsFor = () => [],
    transitionFor = () => false,
    onToggle = () => {}
  }: {
    day: string;
    dateLabel?: string;
    isToday?: boolean;
    activeInstances?: PersistedPeriodTaskInstance[];
    completedInstances?: PersistedPeriodTaskInstance[];
    sourceLabelFor?: (instance: PersistedPeriodTaskInstance) => string;
    attachmentsFor?: (instance: PersistedPeriodTaskInstance) => TaskAttachment[];
    transitionFor?: (instanceKey: string) => boolean;
    onToggle?: (instance: PersistedPeriodTaskInstance) => void;
  } = $props();
</script>

<div class={`flex flex-col gap-3 rounded-xl border p-4 ${
  isToday ? 'border-zinc-500 bg-zinc-800/70' : 'border-zinc-800 bg-zinc-900/30'
}`}>
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <h4 class={`text-xs font-medium ${isToday ? 'text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {day}
      </h4>
      {#if dateLabel}
        <span class="text-xs text-zinc-400 dark:text-zinc-500">
          {dateLabel}
        </span>
      {/if}
    </div>
    {#if isToday}
      <span class="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
        Bugun
      </span>
    {/if}
  </div>

  <div class="flex flex-col gap-2">
    {#each activeInstances as instance (instance.instance_key)}
      <ThisWeekInstanceButton
        {instance}
        completed={false}
        transitioning={transitionFor(instance.instance_key)}
        attachments={attachmentsFor(instance)}
        sourceLabel={sourceLabelFor(instance)}
        onToggle={onToggle}
      />
    {/each}

    {#if completedInstances.length > 0}
      <div class="pt-2">
        <div class="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
          Done
        </div>
        <div class="flex flex-col gap-2">
          {#each completedInstances as instance (instance.instance_key)}
            <ThisWeekInstanceButton
              {instance}
              completed={true}
              attachments={attachmentsFor(instance)}
              sourceLabel={sourceLabelFor(instance)}
              onToggle={onToggle}
            />
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
