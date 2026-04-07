<script lang="ts">
  import type { CapacitySnapshot, ScheduleHealth } from '$lib/planner/types';

  let {
    capacity,
    schedule,
    compact = false
  }: {
    capacity: CapacitySnapshot;
    schedule: ScheduleHealth;
    compact?: boolean;
  } = $props();

  const cardClass = $derived(
    compact
      ? 'rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3'
      : 'rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4'
  );
</script>

<div class={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
  <div class={cardClass}>
    <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Available</div>
    <div class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{capacity.available_hours}h</div>
  </div>
  <div class={cardClass}>
    <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Planned</div>
    <div class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{capacity.planned_hours}h</div>
  </div>
  <div class={cardClass}>
    <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Remaining</div>
    <div class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{capacity.remaining_hours}h</div>
  </div>
  <div class={cardClass}>
    <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Overflow</div>
    <div class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{capacity.overflow_hours}h</div>
    {#if schedule.overflow_warning}
      <div class="mt-2 text-xs text-[var(--text-muted)]">{schedule.overflow_warning}</div>
    {/if}
  </div>
</div>

{#if schedule.due_pressure_warning || capacity.unassigned_hours > 0}
  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
    {#if schedule.due_pressure_warning}
      <span class="rounded-full border border-[var(--border)] px-3 py-1">{schedule.due_pressure_warning}</span>
    {/if}
    {#if capacity.unassigned_hours > 0}
      <span class="rounded-full border border-[var(--border)] px-3 py-1">{capacity.unassigned_hours}h still unassigned</span>
    {/if}
    {#if schedule.locked_count > 0}
      <span class="rounded-full border border-[var(--border)] px-3 py-1">{schedule.locked_count} locked block{schedule.locked_count === 1 ? '' : 's'}</span>
    {/if}
  </div>
{/if}
