<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    icon,
    message,
    actionLabel = '',
    onAction,
    class: className
  }: {
    icon?: Snippet;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    class?: string;
  } = $props();
</script>

<div
  data-slot="empty-state"
  class={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
>
  <div
    class="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-500"
    aria-hidden="true"
  >
    {@render icon?.()}
  </div>
  <p class="text-sm text-zinc-500">{message}</p>
  {#if actionLabel}
    <button
      type="button"
      onclick={() => onAction?.()}
      class="text-xs text-zinc-400 underline underline-offset-2 transition-colors duration-150 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400"
    >
      {actionLabel}
    </button>
  {/if}
</div>
