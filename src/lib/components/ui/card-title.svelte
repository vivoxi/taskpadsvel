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

<h3
  data-slot="card-title"
  class={cn('text-base font-medium text-zinc-200', className)}
>
  {@render children?.()}
</h3>
