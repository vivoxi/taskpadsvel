<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    icon,
    compact = false
  }: {
    title: string;
    description: string;
    icon?: Snippet;
    compact?: boolean;
  } = $props();
</script>

<div class={`rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--panel-soft)] text-center ${compact ? 'px-4 py-6' : 'px-5 py-8'}`}>
  {#if icon}
    <div class="mb-3 flex justify-center text-[var(--text-faint)]">
      {@render icon()}
    </div>
  {/if}
  <h3 class="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
  <p class="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
</div>
