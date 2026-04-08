<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import MonthStrip from '$lib/components/MonthStrip.svelte';
  import { ChevronDown, ChevronLeft, ChevronRight, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import CapacitySummary from '$lib/components/CapacitySummary.svelte';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import {
    type TaskTemplate
  } from '$lib/planner/types';
  import { getNextMonthKey, getPreviousMonthKey } from '$lib/planner/dates';
  import { templateMode } from '$lib/stores';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let templates = $state<TaskTemplate[]>([]);
  let weeklyDraft = $state('');
  let monthlyDraft = $state('');
  let busyTemplateId = $state<string | null>(null);
  let isGenerating = $state(false);
  let isResettingSchedule = $state(false);
  let expandedTemplateId = $state<string | null>(null);

  $effect(() => {
    templates = structuredClone(data.view.templates);
  });

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
  const inactiveTemplates = $derived(
    templates.filter((template) => !template.active).sort(templateSort)
  );

  function updateTemplateState(templateId: string, updater: (template: TaskTemplate) => TaskTemplate) {
    templates = templates.map((template) => (template.id === templateId ? updater(template) : template));
  }

  async function patchTemplate(templateId: string, updates: Record<string, unknown>) {
    const previousTemplates = $state.snapshot(templates);
    updateTemplateState(templateId, (template) => ({ ...template, ...updates }));

    try {
      await apiSendJson('/api/task-templates', 'PATCH', {
        id: templateId,
        ...updates
      });
      if ('active' in updates) {
        await invalidateAll();
      }
    } catch (error) {
      templates = previousTemplates;
      toast.error(error instanceof Error ? error.message : 'Failed to update template');
    }
  }

  async function createTemplate(kind: 'weekly' | 'monthly') {
    const title = kind === 'weekly' ? weeklyDraft.trim() : monthlyDraft.trim();
    if (!title) return;

    busyTemplateId = `creating:${kind}`;
    try {
      await apiSendJson('/api/task-templates', 'POST', { title, kind });
      if (kind === 'weekly') weeklyDraft = '';
      else monthlyDraft = '';
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      busyTemplateId = null;
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm('Are you sure you want to delete this recurring template?')) {
      return;
    }

    busyTemplateId = templateId;

    try {
      await apiFetch(`/api/task-templates/${templateId}`, {
        method: 'DELETE'
      });
      toast('Template deleted', {
        action: {
          label: 'Undo',
          onClick: () => toast('Template deletion is permanent after refresh.')
        }
      });
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete template');
    } finally {
      busyTemplateId = null;
    }
  }

  async function generateSchedule() {
    isGenerating = true;

    try {
      const response = await apiSendJson<{ createdBlocks: number; warnings: string[] }>(
        '/api/schedule/generate',
        'POST',
        { monthKey: data.view.monthKey }
      );
      toast.success(`Generated ${response.createdBlocks} schedule block${response.createdBlocks === 1 ? '' : 's'}`);
      if (response.warnings[0]) {
        toast(response.warnings[0]);
      }
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate schedule');
    } finally {
      isGenerating = false;
    }
  }

  async function resetSchedule() {
    if (!confirm('Are you sure you want to clear generated schedule blocks for this month? Locked blocks will stay.')) {
      return;
    }

    isResettingSchedule = true;

    try {
      const response = await apiSendJson<{ removedBlocks: number; lockedBlocksKept: number }>(
        '/api/schedule/reset',
        'POST',
        { monthKey: data.view.monthKey }
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
      isResettingSchedule = false;
    }
  }

  function parseEstimate(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toggleTemplateDetails(templateId: string) {
    expandedTemplateId = expandedTemplateId === templateId ? null : templateId;
  }
</script>

<svelte:head>
  <title>Planner · Taskpad</title>
</svelte:head>

<div class="sticky top-0 z-20">
  <MonthStrip monthKey={data.view.monthKey} basePath="/planner" />
</div>

<div class="px-4 py-4 sm:px-6 sm:py-6">
  <div class="mx-auto flex max-w-[1440px] flex-col gap-6">
    <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-soft)] sm:px-7 sm:py-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <p class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Planning studio</p>
          <h1 class="text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
            {data.view.label}
          </h1>
          <p class="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            Place recurring work, compare it against real capacity, and generate a schedule without leaving the month surface.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            onclick={generateSchedule}
            disabled={isGenerating}
          >
            <Sparkles size={15} />
            {isGenerating ? 'Generating' : 'Generate'}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            onclick={resetSchedule}
            disabled={isResettingSchedule}
          >
            <RotateCcw size={15} />
            {isResettingSchedule ? 'Resetting' : 'Reset'}
          </button>
          <a
            href={`/planner?month=${getPreviousMonthKey(data.view.monthKey)}`}
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronLeft size={16} />
            Previous
          </a>
          <a
            href="/planner"
            class="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Current month
          </a>
          <a
            href={`/planner?month=${getNextMonthKey(data.view.monthKey)}`}
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Next
            <ChevronRight size={16} />
          </a>
        </div>
      </div>

      <div class="mt-6">
        <CapacitySummary capacity={data.view.capacity} schedule={data.view.schedule} />
      </div>
    </section>

    <div class="max-w-2xl space-y-4">
        <section class={`rounded-[28px] border bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)] ${
          $templateMode ? 'border-[var(--border-strong)] ring-1 ring-[var(--border-strong)]' : 'border-[var(--border)]'
        }`}>
          <div class="border-b border-[var(--border)] pb-4">
            <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Recurring work</div>
            <h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Template list</h2>
            <p class="mt-2 text-sm text-[var(--text-muted)]">
              {$templateMode
                ? 'Template mode is on. Defaults here directly shape new monthly materialization.'
                : 'Compact recurring defaults that stay editable without taking over the planning screen.'}
            </p>
          </div>

          <div class="space-y-4 pt-4">
            <div class="space-y-2">
              <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Add weekly</div>
              <div class="flex gap-2">
                <input
                  bind:value={weeklyDraft}
                  placeholder="Weekly recurring work"
                  class="min-w-0 flex-1 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                />
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => createTemplate('weekly')}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Add monthly</div>
              <div class="flex gap-2">
                <input
                  bind:value={monthlyDraft}
                  placeholder="Monthly recurring work"
                  class="min-w-0 flex-1 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
                />
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => createTemplate('monthly')}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Weekly templates</div>
              {#if weeklyTemplates.length === 0}
                <div class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  No weekly templates yet.
                </div>
              {:else}
                {#each weeklyTemplates as template (template.id)}
                  <article class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3">
                    <div class="flex items-start gap-2">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                            Weekly
                          </span>
                          <input
                            value={template.title}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                title: (event.currentTarget as HTMLInputElement).value.trim() || template.title
                              })}
                            class="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-[var(--text-primary)] outline-none"
                          />
                        </div>
                        <div class="mt-1.5">
                          <TaskMetaChips
                            compact
                            hours={template.hours_needed_default ?? template.estimate_hours}
                            sourceType={template.source_type_default}
                          />
                        </div>
                      </div>

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          onclick={() => toggleTemplateDetails(template.id)}
                        >
                          Edit
                          <ChevronDown
                            size={12}
                            class={`transition-transform ${expandedTemplateId === template.id ? 'rotate-180' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          class="rounded-full p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
                          onclick={() => deleteTemplate(template.id)}
                          disabled={busyTemplateId === template.id}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {#if expandedTemplateId === template.id}
                      <div class="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                        <label class="text-xs text-[var(--text-muted)]">
                          Estimate
                          <input
                            value={template.estimate_hours ?? ''}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                estimate_hours: parseEstimate((event.currentTarget as HTMLInputElement).value)
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          />
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Hours default
                          <input
                            value={template.hours_needed_default ?? ''}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                hours_needed_default: parseEstimate((event.currentTarget as HTMLInputElement).value)
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          />
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Active
                          <select
                            value={template.active ? 'true' : 'false'}
                            onchange={(event) =>
                              patchTemplate(template.id, {
                                active: (event.currentTarget as HTMLSelectElement).value === 'true'
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          >
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </select>
                        </label>

                        <label class="text-xs text-[var(--text-muted)] sm:col-span-2">
                          Default day
                          <select
                            value={template.preferred_day ?? ''}
                            onchange={(event) =>
                              patchTemplate(template.id, {
                                preferred_day: (event.currentTarget as HTMLSelectElement).value || null
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          >
                            <option value="">Unassigned</option>
                            {#each DAY_NAMES as dayName}
                              <option value={dayName}>{dayName}</option>
                            {/each}
                          </select>
                        </label>
                      </div>
                    {/if}
                  </article>
                {/each}
              {/if}
            </div>

            <div class="space-y-3">
              <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Monthly templates</div>
              {#if monthlyTemplates.length === 0}
                <div class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  No monthly templates yet.
                </div>
              {:else}
                {#each monthlyTemplates as template (template.id)}
                  <article class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-3">
                    <div class="flex items-start gap-2">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                            Monthly
                          </span>
                          <input
                            value={template.title}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                title: (event.currentTarget as HTMLInputElement).value.trim() || template.title
                              })}
                            class="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-medium text-[var(--text-primary)] outline-none"
                          />
                        </div>
                        <div class="mt-1.5">
                          <TaskMetaChips
                            compact
                            hours={template.hours_needed_default ?? template.estimate_hours}
                            sourceType={template.source_type_default}
                          />
                        </div>
                      </div>

                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          onclick={() => toggleTemplateDetails(template.id)}
                        >
                          Edit
                          <ChevronDown
                            size={12}
                            class={`transition-transform ${expandedTemplateId === template.id ? 'rotate-180' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          class="rounded-full p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
                          onclick={() => deleteTemplate(template.id)}
                          disabled={busyTemplateId === template.id}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {#if expandedTemplateId === template.id}
                      <div class="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                        <label class="text-xs text-[var(--text-muted)]">
                          Estimate
                          <input
                            value={template.estimate_hours ?? ''}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                estimate_hours: parseEstimate((event.currentTarget as HTMLInputElement).value)
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          />
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Hours default
                          <input
                            value={template.hours_needed_default ?? ''}
                            onblur={(event) =>
                              patchTemplate(template.id, {
                                hours_needed_default: parseEstimate((event.currentTarget as HTMLInputElement).value)
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          />
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Active
                          <select
                            value={template.active ? 'true' : 'false'}
                            onchange={(event) =>
                              patchTemplate(template.id, {
                                active: (event.currentTarget as HTMLSelectElement).value === 'true'
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          >
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </select>
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Default day
                          <select
                            value={template.preferred_day ?? ''}
                            onchange={(event) =>
                              patchTemplate(template.id, {
                                preferred_day: (event.currentTarget as HTMLSelectElement).value || null
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          >
                            <option value="">Unassigned</option>
                            {#each DAY_NAMES as dayName}
                              <option value={dayName}>{dayName}</option>
                            {/each}
                          </select>
                        </label>

                        <label class="text-xs text-[var(--text-muted)]">
                          Default week
                          <select
                            value={template.preferred_week_of_month ?? ''}
                            onchange={(event) =>
                              patchTemplate(template.id, {
                                preferred_week_of_month:
                                  Number.parseInt((event.currentTarget as HTMLSelectElement).value, 10) || null
                              })}
                            class="mt-1 w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                          >
                            <option value="">Unassigned</option>
                            {#each data.view.weeks as week}
                              <option value={week.index}>{week.shortLabel}</option>
                            {/each}
                          </select>
                        </label>
                      </div>
                    {/if}
                  </article>
                {/each}
              {/if}
            </div>

            {#if inactiveTemplates.length > 0}
              <div class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                {inactiveTemplates.length} inactive template{inactiveTemplates.length === 1 ? '' : 's'} stay in history but no longer materialize into planning.
              </div>
            {/if}
          </div>
        </section>
    </div>
  </div>
</div>

