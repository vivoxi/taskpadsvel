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

<h2
  data-slot="section-header"
  class={cn('text-sm font-medium uppercase tracking-widest text-zinc-400', className)}
>
  {@render children?.()}
</h2>
