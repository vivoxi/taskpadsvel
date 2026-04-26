<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ChevronDown, Ellipsis, Plus, RotateCcw, Sparkles } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import CapacitySummary from '$lib/components/CapacitySummary.svelte';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import { DAY_NAMES, type CapacitySnapshot, type ScheduleHealth, type TaskTemplate } from '$lib/planner/types';
  import { apiSendJson } from '$lib/client/api';
  import { showConfirm } from '$lib/stores/confirm';

  let {
    monthKey,
    templates,
    capacity,
    schedule,
    compact = false
  }: {
    monthKey: string;
    templates: TaskTemplate[];
    capacity: CapacitySnapshot;
    schedule: ScheduleHealth;
    compact?: boolean;
  } = $props();

  let weeklyTitle = $state('');
  let weeklyHours = $state<string>('');
  let weeklyDay = $state('');
  let monthlyTitle = $state('');
  let monthlyHours = $state<string>('');
  let monthlyWeek = $state('');
  let busyKey = $state<string | null>(null);
  let expandedSection = $state<'weekly' | 'monthly' | null>(null);
  let weeklyMoreOptions = $state(false);
  let monthlyMoreOptions = $state(false);

  function templateSort(left: TaskTemplate, right: TaskTemplate) {
    return (
      (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.title.localeCompare(right.title)
    );
  }

  const weeklyTemplates = $derived(
    templates.filter((template) => template.kind === 'weekly' && template.active).sort(templateSort)
  );
  const monthlyTemplates = $derived(
    templates.filter((template) => template.kind === 'monthly' && template.active).sort(templateSort)
  );

  function parseHours(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePreferredWeek(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  async function createTemplate(kind: 'weekly' | 'monthly') {
    const title = kind === 'weekly' ? weeklyTitle.trim() : monthlyTitle.trim();
    if (!title) return;

    const hours = kind === 'weekly' ? parseHours(weeklyHours) : parseHours(monthlyHours);
    const preferred_day = kind === 'weekly' && weeklyDay ? weeklyDay : null;
    const preferred_week_of_month = kind === 'monthly' ? parsePreferredWeek(monthlyWeek) : null;

    busyKey = `create:${kind}`;
    try {
      const created = await apiSendJson<TaskTemplate>('/api/task-templates', 'POST', { title, kind });
      const patch: Record<string, unknown> = { id: created.id };
      if (hours !== null) patch.hours_needed_default = hours;
      if (preferred_day) patch.preferred_day = preferred_day;
      if (preferred_week_of_month !== null) patch.preferred_week_of_month = preferred_week_of_month;

      if (Object.keys(patch).length > 1) {
        await apiSendJson('/api/task-templates', 'PATCH', patch);
      }

      if (kind === 'weekly') {
        weeklyTitle = '';
        weeklyHours = '';
        weeklyDay = '';
      } else {
        monthlyTitle = '';
        monthlyHours = '';
        monthlyWeek = '';
      }

      toast.success(`${kind === 'weekly' ? 'Weekly' : 'Monthly'} template added`);
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      busyKey = null;
    }
  }

  async function generateSchedule() {
    busyKey = 'generate';
    try {
      const response = await apiSendJson<{ createdBlocks: number; warnings: string[] }>(
        '/api/schedule/generate',
        'POST',
        { monthKey }
      );
      toast.success(`Generated ${response.createdBlocks} schedule block${response.createdBlocks === 1 ? '' : 's'}`);
      if (response.warnings[0]) toast(response.warnings[0]);
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate schedule');
    } finally {
      busyKey = null;
    }
  }

  async function resetSchedule() {
    const confirmed = await showConfirm(
      'Generated schedule blocks for this month will be removed. Locked blocks stay in place.',
      'Reset month schedule?'
    );
    if (!confirmed) return;

    busyKey = 'reset';
    try {
      const response = await apiSendJson<{ removedBlocks: number; lockedBlocksKept: number }>(
        '/api/schedule/reset',
        'POST',
        { monthKey }
      );
      toast.success(
        `Cleared ${response.removedBlocks} generated block${response.removedBlocks === 1 ? '' : 's'}`
      );
      if (response.lockedBlocksKept > 0) {
        toast(`${response.lockedBlocksKept} locked block${response.lockedBlocksKept === 1 ? '' : 's'} kept`);
      }
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset schedule');
    } finally {
      busyKey = null;
    }
  }

  function toggleSection(section: 'weekly' | 'monthly') {
    expandedSection = expandedSection === section ? null : section;
  }
</script>

<section class="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
  <div class="border-b border-[var(--border)] px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">Planner</h2>
        <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          Weekly templates repeat by weekday. Monthly templates land once per month.
        </p>
      </div>
      <a
        href={`/planner?month=${monthKey}`}
        class="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        Open Planner
      </a>
    </div>

    <div class="mt-4">
      <CapacitySummary compact capacity={capacity} schedule={schedule} />
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        onclick={generateSchedule}
        disabled={busyKey === 'generate'}
      >
        <Sparkles size={13} />
        {busyKey === 'generate' ? 'Generating…' : 'Generate'}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.14)] disabled:opacity-50"
        onclick={resetSchedule}
        disabled={busyKey === 'reset'}
      >
        <RotateCcw size={13} />
        {busyKey === 'reset' ? 'Resetting…' : 'Reset'}
      </button>
    </div>
  </div>

  <div class="space-y-4 p-4">
    <article class="rounded-lg border border-[var(--border)] bg-[var(--panel-soft)]">
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        onclick={() => toggleSection('weekly')}
      >
        <div>
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Weekly templates</div>
          <div class="mt-1 text-sm text-[var(--text-secondary)]">{weeklyTemplates.length} active</div>
        </div>
        <ChevronDown
          size={14}
          class={`text-[var(--text-faint)] transition-transform ${expandedSection === 'weekly' ? 'rotate-180' : ''}`}
        />
      </button>

      {#if expandedSection === 'weekly'}
        <div class="space-y-3 border-t border-[var(--border)] px-4 py-4">
          <div class="grid gap-2">
            <input
              bind:value={weeklyTitle}
              placeholder="Weekly recurring work"
              class="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            />
            <div class="flex flex-wrap items-center gap-2">
              {#if !compact}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => (weeklyMoreOptions = !weeklyMoreOptions)}
                >
                  <Ellipsis size={12} />
                  {weeklyMoreOptions ? 'Less options' : 'More options'}
                </button>
              {/if}
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
                onclick={() => createTemplate('weekly')}
                disabled={!weeklyTitle.trim() || busyKey === 'create:weekly'}
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            {#if !compact && weeklyMoreOptions}
              <div class="grid grid-cols-2 gap-2">
                <input
                  bind:value={weeklyHours}
                  type="number"
                  min="0.25"
                  step="0.25"
                  placeholder="Hours"
                  class="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                />
                <select
                  bind:value={weeklyDay}
                  class="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                >
                  <option value="">Any day</option>
                  {#each DAY_NAMES as day}
                    <option value={day}>{day.slice(0, 3)}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>

          {#if weeklyTemplates.length === 0}
            <p class="text-sm text-[var(--text-muted)]">No weekly templates yet.</p>
          {:else}
            <div class="space-y-2">
              {#each weeklyTemplates as template (template.id)}
                <div class="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-[var(--text-primary)]">{template.title}</div>
                    <div class="mt-1">
                      <TaskMetaChips
                        compact
                        hours={template.hours_needed_default}
                        sourceType={template.source_type_default}
                      />
                      {#if template.preferred_day}
                        <div class="mt-1.5">
                          <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                            {template.preferred_day.slice(0, 3)}
                          </span>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <p class="text-xs text-[var(--text-faint)]">
            Edit or delete weekly templates in <a class="underline underline-offset-2" href={`/planner?month=${monthKey}`}>Advanced Planner</a>.
          </p>
        </div>
      {/if}
    </article>

    <article class="rounded-lg border border-[var(--border)] bg-[var(--panel-soft)]">
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        onclick={() => toggleSection('monthly')}
      >
        <div>
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Monthly templates</div>
          <div class="mt-1 text-sm text-[var(--text-secondary)]">{monthlyTemplates.length} active</div>
        </div>
        <ChevronDown
          size={14}
          class={`text-[var(--text-faint)] transition-transform ${expandedSection === 'monthly' ? 'rotate-180' : ''}`}
        />
      </button>

      {#if expandedSection === 'monthly'}
        <div class="space-y-3 border-t border-[var(--border)] px-4 py-4">
          <div class="grid gap-2">
            <input
              bind:value={monthlyTitle}
              placeholder="Monthly recurring work"
              class="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            />
            <div class="flex flex-wrap items-center gap-2">
              {#if !compact}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => (monthlyMoreOptions = !monthlyMoreOptions)}
                >
                  <Ellipsis size={12} />
                  {monthlyMoreOptions ? 'Less options' : 'More options'}
                </button>
              {/if}
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
                onclick={() => createTemplate('monthly')}
                disabled={!monthlyTitle.trim() || busyKey === 'create:monthly'}
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            {#if !compact && monthlyMoreOptions}
              <div class="grid grid-cols-2 gap-2">
                <input
                  bind:value={monthlyHours}
                  type="number"
                  min="0.25"
                  step="0.25"
                  placeholder="Hours"
                  class="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                />
                <select
                  bind:value={monthlyWeek}
                  class="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                >
                  <option value="">Any week</option>
                  <option value="1">Week 1</option>
                  <option value="2">Week 2</option>
                  <option value="3">Week 3</option>
                  <option value="4">Week 4</option>
                  <option value="5">Week 5</option>
                </select>
              </div>
            {/if}
          </div>

          {#if monthlyTemplates.length === 0}
            <p class="text-sm text-[var(--text-muted)]">No monthly templates yet.</p>
          {:else}
            <div class="space-y-2">
              {#each monthlyTemplates as template (template.id)}
                <div class="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-[var(--text-primary)]">{template.title}</div>
                    <div class="mt-1">
                      <TaskMetaChips
                        compact
                        hours={template.hours_needed_default}
                        sourceType={template.source_type_default}
                      />
                      {#if template.preferred_week_of_month}
                        <div class="mt-1.5">
                          <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                            Week {template.preferred_week_of_month}
                          </span>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <p class="text-xs text-[var(--text-faint)]">
            Edit or delete monthly templates in <a class="underline underline-offset-2" href={`/planner?month=${monthKey}`}>Advanced Planner</a>.
          </p>
        </div>
      {/if}
    </article>
  </div>
</section>
