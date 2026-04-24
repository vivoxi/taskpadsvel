<script lang="ts">
  import { goto } from '$app/navigation';
  import { CheckCheck, Plus, Trash2 } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import { showConfirm } from '$lib/stores/confirm';
  import type { PlannerBlock } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function relDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'bugün';
    if (diffDays === 1) return 'dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

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
    if (!await showConfirm('This one-time task list will be permanently deleted.', 'Delete list?')) {
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
    <aside class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
      <div class="border-b border-[var(--border)] pb-3">
        <h1 class="text-sm font-medium tracking-[-0.02em] text-[var(--text-primary)]">Lists</h1>
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
              {relDate(document.updated_at)}
            </div>
          </a>
        {/each}
      </div>
    </aside>

    <section class="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-4 sm:px-5">
      <div class="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <input
            value={data.view.documents.find((document) => document.id === data.view.selectedDocumentId)?.title ?? 'Untitled list'}
            onblur={(event) => renameDocument((event.currentTarget as HTMLInputElement).value)}
            class="w-full border-none bg-transparent p-0 text-lg font-medium tracking-[-0.02em] text-[var(--text-primary)] outline-none"
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
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border);border-radius:6px;overflow:hidden">
          <div style="background:var(--panel-soft);padding:10px 12px">
            <div style="font-size:10px;color:var(--text-faint);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Open</div>
            <div style="font-size:18px;font-weight:500;color:var(--text-primary)">{openCount}</div>
          </div>
          <div style="background:var(--panel-soft);padding:10px 12px">
            <div style="font-size:10px;color:var(--text-faint);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Done</div>
            <div style="font-size:18px;font-weight:500;color:var(--text-primary)">{completedCount}</div>
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
