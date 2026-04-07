<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Download, Paperclip, Plus, Trash2, Upload } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import type { PlannerBlock } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let uploading = $state(false);

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
    if (!confirm('Are you sure you want to delete this note? This will also remove its attachments.')) {
      return;
    }

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

  async function uploadAttachment(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploading = true;

    try {
      const form = new FormData();
      form.set('file', file);
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}/attachments`, {
        method: 'POST',
        body: form
      });
      toast.success('Attachment uploaded');
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload attachment');
    } finally {
      input.value = '';
      uploading = false;
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!confirm('Are you sure you want to remove this attachment?')) {
      return;
    }

    try {
      await apiFetch(
        `/api/notes/documents/${data.view.selectedDocumentId}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );
      toast('Attachment deleted', {
        action: {
          label: 'Undo',
          onClick: () => toast('Attachment delete cannot be undone after file removal.')
        }
      });
      await invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete attachment');
    }
  }
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto grid max-w-[1440px] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <aside class="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] px-4 py-4 shadow-[var(--shadow-soft)]">
      <div class="border-b border-[var(--border)] pb-4">
        <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Notes space</div>
        <h1 class="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Documents</h1>
        <p class="mt-1.5 text-sm leading-5 text-[var(--text-muted)]">
          Long-form notes, reference material, and thinking that should stay separate from structured planning metadata.
        </p>
      </div>

      <button
        type="button"
        class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        onclick={createDocument}
      >
        <Plus size={14} />
        New note
      </button>

      <div class="mt-3 space-y-1.5">
        {#each data.view.documents as document (document.id)}
          <a
            href={`/notes?doc=${document.id}`}
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
        <div class="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Current note</div>
        <input
            value={data.view.documents.find((document) => document.id === data.view.selectedDocumentId)?.title ?? 'Untitled'}
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
        <div class="mb-3 rounded-[16px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
          Notes are for context and writing. Priority, due dates, capacity, carry-forward, and scheduling now live in structured planner data.
        </div>

        <section class="mb-5 rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] px-3.5 py-3.5">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">Attachments</div>
              <p class="mt-1.5 text-sm text-[var(--text-muted)]">
                Keep source files, references, or exports close to the note without turning notes into a planner surface.
              </p>
            </div>

            <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              <Upload size={14} />
              {uploading ? 'Uploading...' : 'Attach file'}
              <input
                type="file"
                class="hidden"
                disabled={uploading}
                onchange={uploadAttachment}
              />
            </label>
          </div>

          <div class="mt-3 space-y-2">
            {#if data.view.attachments.length === 0}
              <div class="rounded-[16px] border border-dashed border-[var(--border)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
                No files attached to this note yet.
              </div>
            {:else}
              {#each data.view.attachments as attachment (attachment.id)}
                <div class="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5">
                  <div class="min-w-0 flex items-center gap-3">
                    <span class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-faint)]">
                      <Paperclip size={14} />
                    </span>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium text-[var(--text-primary)]">{attachment.file_name}</div>
                      <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {new Date(attachment.created_at).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <a
                      href={`/uploads/${attachment.file_path}`}
                      target="_blank"
                      rel="noreferrer"
                      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <Download size={12} />
                      Open
                    </a>
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      onclick={() => deleteAttachment(attachment.id)}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>

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
