<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    tone = 'default',
    className = ''
  }: {
    children?: Snippet;
    tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
    className?: string;
  } = $props();

  const tones = {
    default: 'bg-[var(--panel-soft)] text-[var(--text-secondary)] border-[var(--border)]',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20',
    success: 'bg-[rgba(34,197,94,0.12)] text-[var(--success)] border-[rgba(34,197,94,0.2)]',
    warning: 'bg-[rgba(245,158,11,0.12)] text-[var(--warning)] border-[rgba(245,158,11,0.2)]',
    danger: 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)] border-[rgba(239,68,68,0.2)]'
  } as const;
</script>

<span class={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
  {@render children?.()}
</span>
