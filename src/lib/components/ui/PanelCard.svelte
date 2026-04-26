<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    title = '',
    eyebrow = '',
    actions,
    className = '',
    padded = true
  }: {
    children?: Snippet;
    title?: string;
    eyebrow?: string;
    actions?: Snippet;
    className?: string;
    padded?: boolean;
  } = $props();
</script>

<section
  class={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel)] ${padded ? 'px-4 py-4 sm:px-5' : ''} ${className}`}
>
  {#if title || eyebrow || actions}
    <div class={`flex items-start justify-between gap-3 ${children ? 'border-b border-[var(--border)] pb-3' : ''}`}>
      <div class="min-w-0">
        {#if eyebrow}
          <div class="text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">{eyebrow}</div>
        {/if}
        {#if title}
          <h2 class="mt-1 text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
        {/if}
      </div>
      {#if actions}
        <div class="shrink-0">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/if}

  {#if children}
    <div class={title || eyebrow || actions ? 'pt-3' : ''}>
      {@render children()}
    </div>
  {/if}
</section>
