<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle = '',
    meta = '',
    actions
  }: {
    title: string;
    subtitle?: string;
    meta?: string;
    actions?: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div class="min-w-0">
    <div class="flex flex-wrap items-baseline gap-3">
      <h1 class="text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{title}</h1>
      {#if meta}
        <span class="text-xs text-[var(--text-faint)]">{meta}</span>
      {/if}
    </div>
    {#if subtitle}
      <p class="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
