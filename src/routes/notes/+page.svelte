<script lang="ts">
  import { goto } from '$app/navigation';
  import { Plus, Trash2 } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import type { PlannerBlock } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  async function createDocument() {
    try {
      const document = await apiSendJson<{ id: string }>('/api/notes/documents', 'POST', {
        title: 'Untitled'
      });
      await goto(`/notes?doc=${document.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create note');
    }
  }

  async function renameDocument(title: string) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: title.trim() || 'Untitled'
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename note');
    }
  }

  async function deleteDocument() {
    try {
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}`, {
        method: 'DELETE'
      });
      await goto('/notes');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete note');
    }
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}/blocks`, 'POST', {
        blocks
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save note');
    }
  }
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-6 sm:py-6">
  <div class="mx-auto grid max-w-[1440px] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <aside class="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-soft)] sm:px-5">
      <div class="border-b border-[var(--border)] pb-4">
        <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Notes space</div>
        <h1 class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Documents</h1>
        <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Long-form notes, reference material, and thinking that should stay separate from the weekly workspace.
        </p>
      </div>

      <button
        type="button"
        class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={createDocument}
      >
        <Plus size={14} />
        New note
      </button>

      <div class="mt-4 space-y-2">
        {#each data.view.documents as document (document.id)}
          <a
            href={`/notes?doc=${document.id}`}
            class={`block rounded-[18px] border px-4 py-3 transition-colors ${
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

    <section class="rounded-[32px] border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--shadow-soft)] sm:px-8 sm:py-7">
      <div class="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Current note</div>
          <input
            value={data.view.documents.find((document) => document.id === data.view.selectedDocumentId)?.title ?? 'Untitled'}
            onblur={(event) => renameDocument((event.currentTarget as HTMLInputElement).value)}
            class="mt-3 w-full border-none bg-transparent p-0 text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] outline-none"
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

      <div class="pt-6">
        <BlockEditor
          sourceKey={data.view.selectedDocumentId}
          blocks={data.view.blocks}
          emptyLabel="Start this note with a heading, paragraph, or checklist"
          onCommit={saveBlocks}
        />
      </div>
    </section>
  </div>
</div>
