<script lang="ts">
  import { syncState } from '$lib/stores';

  const palette = {
    saving: 'bg-zinc-500',
    synced: 'bg-zinc-900 dark:bg-zinc-100',
    offline: 'bg-zinc-400',
    conflict: 'bg-zinc-700'
  } as const;
</script>

<div class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] shadow-[var(--shadow-card)]">
  <span class={`h-2 w-2 rounded-full ${palette[$syncState]}`}></span>
  {$syncState}
</div>
