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

<h1
  data-slot="page-title"
  class={cn('text-xl font-semibold text-zinc-100', className)}
>
  {@render children?.()}
</h1>
