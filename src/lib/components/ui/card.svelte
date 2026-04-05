<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    children,
    class: className
  }: {
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div
  data-slot="card"
  class={cn(
    'rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors duration-150 hover:border-zinc-700',
    className
  )}
>
  {@render children?.()}
</div>
