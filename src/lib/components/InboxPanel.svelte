<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Archive, ArrowRight, Inbox, Plus, Trash2 } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import TaskMetaChips from '$lib/components/TaskMetaChips.svelte';
  import type { DayName, InboxItem, TaskPriority } from '$lib/planner/types';

  let {
    title = 'Inbox',
    description = 'Quick capture for work that needs sorting.',
    items,
    monthKey,
    weekKey = null,
    compact = false
  }: {
    title?: string;
    description?: string;
    items: InboxItem[];
    monthKey: string;
    weekKey?: string | null;
    compact?: boolean;
  } = $props();

  let localItems = $state<InboxItem[]>([]);
  let draftTitle = $state('');
  let draftPriority = $state<TaskPriority>('medium');
  let draftHours = $state('');
  let draftDueDate = $state('');
  let draftCategory = $state('');

  $effect(() => {
    localItems = structuredClone(items);
  });

  async function createItem() {
    const title = draftTitle.trim();
    if (!title) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: InboxItem = {
      id: tempId,
      title,
      notes: null,
      priority: draftPriority,
      due_date: draftDueDate || null,
      hours_needed: draftHours ? Number.parseFloat(draftHours) : null,
      category: draftCategory.trim() || null,
      preferred_day: null,
      preferred_week: null,
      source_type: 'inbox',
      promoted_to_instance_id: null,
      promoted_to_template_id: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    localItems = [optimistic, ...localItems];
    draftTitle = '';
    draftHours = '';
    draftDueDate = '';
    draftCategory = '';
    draftPriority = 'medium';

    try {
      const created = await apiSendJson<InboxItem>('/api/inbox', 'POST', {
        title,
        priority: optimistic.priority,
        due_date: optimistic.due_date,
        hours_needed: optimistic.hours_needed,
        category: optimistic.category
      });
      localItems = localItems.map((item) => (item.id === tempId ? created : item));
      await invalidateAll();
    } catch (error) {
      localItems = localItems.filter((item) => item.id !== tempId);
      toast.error(error instanceof Error ? error.message : 'Failed to create inbox item');
    }
  }

  async function archiveItem(item: InboxItem) {
    if (!confirm('Are you sure you want to archive this inbox item?')) {
      return;
    }

    localItems = localItems.filter((entry) => entry.id !== item.id);

    try {
      await apiFetch(`/api/inbox/${item.id}`, {
        method: 'DELETE'
      });
      toast('Inbox item archived', {
        action: {
          label: 'Undo',
          onClick: async () => {
            await apiSendJson(`/api/inbox/${item.id}`, 'PATCH', { archived_at: null });
            await invalidateAll();
          }
        }
      });
      await invalidateAll();
    } catch (error) {
      localItems = [item, ...localItems];
      toast.error(error instanceof Error ? error.message : 'Failed to archive inbox item');
    }
  }

  async function promoteItem(item: InboxItem, kind: 'weekly' | 'monthly') {
    localItems = localItems.filter((entry) => entry.id !== item.id);

    try {
      await apiSendJson(`/api/inbox/${item.id}/promote`, 'POST', {
        kind,
        monthKey,
        weekKey
      });
      toast.success(kind === 'weekly' ? 'Moved into this week' : 'Placed into this month');
      await invalidateAll();
    } catch (error) {
      localItems = [item, ...localItems];
      toast.error(error instanceof Error ? error.message : 'Failed to promote inbox item');
    }
  }
</script>

<section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-card)]">
  <div class="border-b border-[var(--border)] pb-4">
    <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
      <Inbox size={14} />
      {title}
    </div>
    <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
  </div>

  <div class="mt-4 space-y-3">
    <div class="rounded-[20px] border border-[var(--border)] bg-[var(--panel-soft)] p-3">
      <input
        bind:value={draftTitle}
        placeholder="Capture work before you decide where it belongs"
        class="w-full border-none bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
      />

      <div class="mt-3 grid gap-2 sm:grid-cols-4">
        <select bind:value={draftPriority} class="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input bind:value={draftHours} placeholder="Hours" class="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none" />
        <input bind:value={draftDueDate} type="date" class="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none" />
        <input bind:value={draftCategory} placeholder="Category" class="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none" />
      </div>

      <button
        type="button"
        class="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={createItem}
      >
        <Plus size={14} />
        Add to inbox
      </button>
    </div>

    <div class="space-y-2">
      {#if localItems.length === 0}
        <div class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
          Inbox is clear.
        </div>
      {:else}
        {#each localItems as item (item.id)}
          <article class="rounded-[18px] border border-[var(--border)] px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                <TaskMetaChips
                  compact
                  priority={item.priority}
                  dueDate={item.due_date}
                  hours={item.hours_needed}
                  category={item.category}
                  sourceType="inbox"
                />
              </div>

              <div class={`flex items-center gap-1 ${compact ? 'flex-col' : ''}`}>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => promoteItem(item, 'weekly')}
                >
                  Week
                  <ArrowRight size={11} />
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => promoteItem(item, 'monthly')}
                >
                  Month
                  <ArrowRight size={11} />
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  onclick={() => archiveItem(item)}
                >
                  {#if compact}
                    <Trash2 size={11} />
                  {:else}
                    <Archive size={11} />
                    Archive
                  {/if}
                </button>
              </div>
            </div>
          </article>
        {/each}
      {/if}
    </div>
  </div>
</section>
