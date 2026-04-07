<script lang="ts">
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const sections = $derived([
    {
      key: 'completed',
      label: 'Completed',
      description: 'Done work that still belongs to the record.',
      tasks: data.view.completedTasks
    },
    {
      key: 'carried',
      label: 'Carried forward',
      description: 'Work that rolled into a later cycle.',
      tasks: data.view.carriedTasks
    },
    {
      key: 'archived',
      label: 'Archived',
      description: 'Closed out or intentionally removed from active planning.',
      tasks: data.view.archivedTasks
    }
  ] as const);
</script>

<svelte:head>
  <title>History · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto flex max-w-[1440px] flex-col gap-5">
    <section class="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-soft)] sm:px-6 sm:py-5">
      <div class="space-y-2">
        <p class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">History center</p>
        <h1 class="text-[2rem] font-semibold tracking-[-0.05em] text-[var(--text-primary)]">Review and archive</h1>
        <p class="max-w-2xl text-sm leading-5 text-[var(--text-muted)]">
          One place for what was completed, carried, or archived, without freezing your operational record into snapshots.
        </p>
      </div>

      <div class="mt-5 grid gap-2.5 sm:grid-cols-4">
        <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Completed</div>
          <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{data.view.summary.completedCount}</div>
        </div>
        <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Carried</div>
          <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{data.view.summary.carriedCount}</div>
        </div>
        <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Archived</div>
          <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{data.view.summary.archivedCount}</div>
        </div>
        <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Attachments</div>
          <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{data.view.attachmentCount}</div>
        </div>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-2">
      {#each sections as section}
        <section class="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-card)]">
          <div class="border-b border-[var(--border)] pb-4">
            <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">{section.label}</div>
            <p class="mt-1.5 text-sm text-[var(--text-muted)]">{section.description}</p>
          </div>

          <div class="space-y-2 pt-3">
            {#if section.tasks.length === 0}
              <div class="rounded-[16px] border border-dashed border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
                Nothing to show here yet.
              </div>
            {:else}
              {#each section.tasks as task (task.id)}
                <article class="rounded-[16px] border border-[var(--border)] px-3.5 py-2.5">
                  <div class="text-sm font-medium text-[var(--text-primary)]">{task.title_snapshot}</div>
                  <TaskMetaChips
                    hours={task.hours_needed}
                    sourceType={task.source_type}
                    carried={task.carried_from_instance_id !== null}
                    archived={task.archived_at !== null}
                  />
                  <div class="mt-2 text-xs text-[var(--text-muted)]">
                    {#if task.week_key}
                      Week {task.week_key}
                    {:else if task.month_key}
                      Month {task.month_key}
                    {:else}
                      Unscoped record
                    {/if}
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </section>
      {/each}
    </div>
  </div>
</div>
