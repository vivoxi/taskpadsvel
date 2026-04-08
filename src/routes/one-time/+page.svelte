<script lang="ts">
  import { goto } from '$app/navigation';
  import { CheckCheck, ListChecks, Plus, Trash2 } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import type { PlannerBlock } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const checklistBlocks = $derived(data.view.blocks.filter((block) => block.type === 'checklist'));
  const completedCount = $derived(checklistBlocks.filter((block) => block.checked === true).length);
  const openCount = $derived(checklistBlocks.length - completedCount);

  async function createDocument() {
    try {
      const document = await apiSendJson<{ id: string }>('/api/notes/documents', 'POST', {
        title: 'Untitled list',
        kind: 'one-time'
      });
      await goto(`/one-time?doc=${document.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create list');
    }
  }

  async function renameDocument(title: string) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: title.trim() || 'Untitled list'
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename list');
    }
  }

  async function deleteDocument() {
    if (!confirm('Are you sure you want to delete this one-time task list?')) {
      return;
    }

    try {
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}`, {
        method: 'DELETE'
      });
      await goto('/one-time');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete list');
    }
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}/blocks`, 'POST', {
        blocks
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save one-time tasks');
    }
  }
</script>

<svelte:head>
  <title>One-Time · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto grid max-w-[1440px] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <aside class="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-soft)]">
      <div class="border-b border-[var(--border)] pb-4">
        <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">One-time work</div>
        <h1 class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Lists</h1>
        <p class="mt-1.5 text-sm leading-5 text-[var(--text-muted)]">
          A dedicated place for one-time work that should stay outside recurring planning and feel as direct as a Notion checklist.
        </p>
      </div>

      <button
        type="button"
        class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={createDocument}
      >
        <Plus size={14} />
        New list
      </button>

      <div class="mt-3 space-y-1.5">
        {#each data.view.documents as document (document.id)}
          <a
            href={`/one-time?doc=${document.id}`}
            class={`block rounded-[16px] border px-3.5 py-2.5 transition-colors ${
              document.id === data.view.selectedDocumentId
                ? 'border-[var(--border-strong)] bg-[var(--panel-soft)]'
                : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-soft)]/70'
            }`}
          >
            <div class="font-medium text-[var(--text-primary)]">{document.title}</div>
            <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Updated {new Date(document.updated_at).toLocaleDateString('en-GB')}
            </div>
          </a>
        {/each}
      </div>
    </aside>

    <section class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-soft)] sm:px-6 sm:py-5">
      <div class="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Current list</div>
          <input
            value={data.view.documents.find((document) => document.id === data.view.selectedDocumentId)?.title ?? 'Untitled list'}
            onblur={(event) => renameDocument((event.currentTarget as HTMLInputElement).value)}
            class="mt-2.5 w-full border-none bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.05em] text-[var(--text-primary)] outline-none"
          />
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          onclick={deleteDocument}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>

      <div class="pt-5">
        <div class="grid gap-2.5 sm:grid-cols-3">
          <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
            <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Open items</div>
            <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{openCount}</div>
            <div class="mt-1 text-[13px] text-[var(--text-muted)]">Still waiting to be wrapped up</div>
          </div>
          <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
            <div class="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Completed</div>
            <div class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{completedCount}</div>
            <div class="mt-1 text-[13px] text-[var(--text-muted)]">Checked off and kept in view</div>
          </div>
          <div class="rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3">
            <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              <ListChecks size={13} />
              Checklist mode
            </div>
            <div class="mt-1.5 text-sm font-medium text-[var(--text-primary)]">Checklist-first editing</div>
            <div class="mt-1 text-[13px] text-[var(--text-muted)]">Add tasks fast, then use headings or text only when the list needs structure.</div>
          </div>
        </div>

        <section class="mt-5 rounded-[20px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3.5 sm:px-4">
          <div class="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
            <CheckCheck size={13} />
            One-time tasks
          </div>

          <BlockEditor
            sourceKey={data.view.selectedDocumentId}
            blocks={data.view.blocks}
            emptyLabel="Start this list with a checklist item"
            emptyBlockType="checklist"
            insertOrder={['checklist', 'heading', 'paragraph', 'divider']}
            onCommit={saveBlocks}
          />
        </section>
      </div>
    </section>
  </div>
</div>
