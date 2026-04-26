<script lang="ts">
  let {
    label,
    value,
    tone = 'default'
  }: {
    label: string;
    value: string | number;
    tone?: 'default' | 'accent';
  } = $props();
</script>

<div class={`rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3 ${tone === 'accent' ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--panel-soft)]'}`}>
  <div class="text-[10px] uppercase tracking-[0.08em] text-[var(--text-faint)]">{label}</div>
  <div class="mt-1 text-lg font-medium text-[var(--text-primary)]">{value}</div>
</div>
