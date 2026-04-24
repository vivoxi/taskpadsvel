<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { FileText, Paperclip, Trash2, Upload } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import BlockEditor from '$lib/components/BlockEditor.svelte';
  import { apiFetch, apiSendJson } from '$lib/client/api';
  import { showConfirm } from '$lib/stores/confirm';
  import type { PlannerBlock, TaskAttachment } from '$lib/planner/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let uploading = $state(false);
  let searchQuery = $state('');
  let debouncedQuery = $state('');

  // ── Debounced search ──────────────────────────────────────────────────────
  $effect(() => {
    const q = searchQuery;
    const t = setTimeout(() => { debouncedQuery = q; }, 150);
    return () => clearTimeout(t);
  });

  // ── Sidebar pagination ────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let sidebarPage = $state(0);
  const totalPages = $derived(Math.ceil(data.view.documents.length / PAGE_SIZE));
  const pagedDocs = $derived(
    data.view.documents.slice(sidebarPage * PAGE_SIZE, (sidebarPage + 1) * PAGE_SIZE)
  );
  const displayedDocs = $derived(
    debouncedQuery.trim()
      ? data.view.documents.filter((d) =>
          d.title.toLowerCase().includes(debouncedQuery.toLowerCase())
        )
      : pagedDocs
  );

  $effect(() => {
    data.view.documents;
    sidebarPage = 0;
  });

  // ── Status bar & preview ──────────────────────────────────────────────────
  const selectedDoc = $derived(
    data.view.documents.find((d) => d.id === data.view.selectedDocumentId)
  );
  const checklistBlocks = $derived(data.view.blocks.filter((b) => b.type === 'checklist'));
  const doneCount = $derived(checklistBlocks.filter((b) => b.checked === true).length);
  const wordCount = $derived(
    data.view.blocks
      .filter((b) => b.text)
      .map((b) => b.text!.replace(/<[^>]+>/g, '').trim())
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .length
  );
  const selectedDocPreview = $derived(
    (() => {
      const first = data.view.blocks.find(
        (b) => b.type !== 'divider' && b.text?.trim()
      );
      if (!first?.text) return '';
      return first.text.replace(/<[^>]+>/g, '').trim().slice(0, 60);
    })()
  );
  const attachmentImages = $derived(data.view.attachments.filter(isImage));
  const attachmentFiles = $derived(data.view.attachments.filter((a) => !isImage(a)));

  // ── Title contenteditable action ──────────────────────────────────────────
  function titleSync(el: HTMLElement, title: string) {
    el.textContent = title;
    return {
      update(next: string) {
        if (document.activeElement !== el) el.textContent = next;
      }
    };
  }

  const currentTitle = $derived(selectedDoc?.title ?? 'Untitled');

  // ── Date helpers ──────────────────────────────────────────────────────────
  function relDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) {
      const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return `bugün ${hm}`;
    }
    if (diffDays === 1) return 'dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  // ── Attachment helpers ────────────────────────────────────────────────────
  function attachmentHref(filePath: string) {
    return `/uploads/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`;
  }

  function isImage(attachment: TaskAttachment) {
    return attachment.mime_type?.startsWith('image/') ?? false;
  }

  // ── Document actions ──────────────────────────────────────────────────────
  async function createDocument() {
    try {
      const doc = await apiSendJson<{ id: string }>('/api/notes/documents', 'POST', { title: 'Untitled' });
      await goto(`/notes?doc=${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create note');
    }
  }

  async function renameDocument(title: string) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}`, 'PATCH', {
        title: title.trim() || 'Untitled'
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename note');
    }
  }

  async function deleteDocument() {
    if (!await showConfirm('This note and all its attachments will be permanently deleted.', 'Delete note?')) return;
    try {
      await apiFetch(`/api/notes/documents/${data.view.selectedDocumentId}`, { method: 'DELETE' });
      await goto('/notes');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete note');
    }
  }

  async function saveBlocks(blocks: PlannerBlock[]) {
    try {
      await apiSendJson(`/api/notes/documents/${data.view.selectedDocumentId}/blocks`, 'POST', { blocks });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save note');
    }
  }

  // ── Attachment actions ────────────────────────────────────────────────────
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
      toast.success('File attached');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      input.value = '';
      uploading = false;
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!await showConfirm('This attachment will be permanently removed.', 'Remove attachment?')) return;
    try {
      await apiFetch(
        `/api/notes/documents/${data.view.selectedDocumentId}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );
      toast('Attachment removed');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove attachment');
    }
  }
</script>

<svelte:head>
  <title>Notes · Taskpad</title>
</svelte:head>

<div class="px-4 py-4 sm:px-5 sm:py-5">
  <div class="mx-auto grid max-w-[1440px] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">

    <!-- ── Sidebar ───────────────────────────────────────────────────────── -->
    <aside class="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
      <div class="flex items-center justify-between gap-2 px-1">
        <h1 class="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Notes</h1>
        <button
          type="button"
          onclick={createDocument}
          class="rounded-full p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]"
          aria-label="New note"
        >
          <span style="display:flex;align-items:center;justify-content:center;width:14px;height:14px;font-size:16px;line-height:1">+</span>
        </button>
      </div>

      <!-- Search -->
      <div class="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--panel-soft)] px-2.5 py-1.5">
        <span style="font-size:11px;color:var(--text-faint)">⌕</span>
        <input
          bind:value={searchQuery}
          placeholder="Ara…"
          class="min-w-0 flex-1 border-none bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>

      <!-- Note list -->
      <div class="flex-1 space-y-0.5">
        {#each displayedDocs as document (document.id)}
          {@const isSelected = document.id === data.view.selectedDocumentId}
          <a
            href={`/notes?doc=${document.id}`}
            class={`block rounded-[12px] border px-3 py-2.5 transition-colors ${
              isSelected
                ? 'border-[var(--border-strong)] bg-[var(--panel-soft)]'
                : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-soft)]/70'
            }`}
            style={isSelected ? 'box-shadow: inset 2px 0 0 var(--accent);' : ''}
          >
            <div class="truncate text-[13px] font-medium leading-snug" style="color:{isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}">
              {document.title}
            </div>
            <div class="mt-1 flex items-end justify-between gap-2">
              <div class="min-w-0 flex-1 truncate text-[11px] leading-none text-[var(--text-muted)]">
                {isSelected ? selectedDocPreview : ''}
              </div>
              <div class="shrink-0 text-[10px] text-[var(--text-faint)]">{relDate(document.updated_at)}</div>
            </div>
          </a>
        {/each}

        {#if displayedDocs.length === 0}
          <p class="px-2 py-1 text-sm text-[var(--text-muted)]">
            {debouncedQuery.trim() ? 'Eşleşen not yok.' : 'No notes yet.'}
          </p>
        {/if}
      </div>

      <!-- Pagination (hidden while searching) -->
      {#if totalPages > 1 && !debouncedQuery.trim()}
        <div class="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            disabled={sidebarPage === 0}
            onclick={() => (sidebarPage -= 1)}
            class="rounded-full px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] disabled:opacity-30"
          >← Prev</button>
          <span class="text-[10px] text-[var(--text-faint)]">{sidebarPage + 1} / {totalPages}</span>
          <button
            type="button"
            disabled={sidebarPage >= totalPages - 1}
            onclick={() => (sidebarPage += 1)}
            class="rounded-full px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-soft)] disabled:opacity-30"
          >Next →</button>
        </div>
      {/if}
    </aside>

    <!-- ── Main content ──────────────────────────────────────────────────── -->
    <section class="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]">

      <!-- Header -->
      <div class="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div class="min-w-0 flex-1">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            contenteditable="true"
            role="textbox"
            tabindex="0"
            aria-label="Note title"
            use:titleSync={currentTitle}
            onblur={(e) => renameDocument((e.currentTarget as HTMLElement).textContent?.trim() ?? '')}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
              if (e.key === 'Escape') { (e.currentTarget as HTMLElement).blur(); }
            }}
            style="font-size:26px;font-weight:600;letter-spacing:-0.03em;line-height:1.2;min-height:1.25em;white-space:nowrap;overflow:hidden"
            class="w-full bg-transparent text-[var(--text-primary)] outline-none"
          ></div>
        </div>
        <div class="mt-1 flex shrink-0 items-center gap-1.5">
          <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
            <Upload size={11} />
            {uploading ? 'Uploading…' : 'Attach'}
            <input type="file" class="hidden" disabled={uploading} onchange={uploadAttachment} />
          </label>
          <button
            type="button"
            onclick={deleteDocument}
            class="rounded-full p-2 text-[var(--text-faint)] transition-colors hover:bg-red-950/30 hover:text-red-500"
            aria-label="Delete note"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div class="flex-1 space-y-5 px-5 py-5">

        <!-- ── Attachments (only shown when present) ────────────────────── -->
        {#if data.view.attachments.length > 0}
          <div>
            <div class="mb-2">
              <span class="text-[11px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Attachments · {data.view.attachments.length}
              </span>
            </div>

            {#if attachmentImages.length > 0}
              <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {#each attachmentImages as att (att.id)}
                  <div class="group relative overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)]">
                    <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer">
                      <img
                        src={attachmentHref(att.file_path)}
                        alt={att.file_name}
                        class="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                        loading="lazy"
                      />
                    </a>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="absolute right-1.5 top-1.5 hidden rounded-full bg-[var(--panel)]/80 p-1 text-[var(--text-faint)] backdrop-blur-sm transition-colors hover:text-red-500 group-hover:flex"
                      aria-label="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                    <div class="truncate px-2 pb-1.5 pt-1 text-[10px] text-[var(--text-faint)]">{att.file_name}</div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if attachmentFiles.length > 0}
              <div class="space-y-1.5">
                {#each attachmentFiles as att (att.id)}
                  <div class="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2">
                    <span class="shrink-0 text-[var(--text-faint)]">
                      {#if att.mime_type === 'application/pdf'}
                        <FileText size={14} />
                      {:else}
                        <Paperclip size={14} />
                      {/if}
                    </span>
                    <a
                      href={attachmentHref(att.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      class="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >{att.file_name}</a>
                    <span class="shrink-0 text-[10px] text-[var(--text-faint)]">{relDate(att.created_at)}</span>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="shrink-0 rounded p-1 text-[var(--text-faint)] transition-colors hover:text-red-500"
                      aria-label="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- ── Editor ───────────────────────────────────────────────────── -->
        <BlockEditor
          sourceKey={data.view.selectedDocumentId}
          blocks={data.view.blocks}
          emptyLabel="Start this note with a heading, paragraph, or checklist"
          onCommit={saveBlocks}
        />
      </div>

      <!-- ── Status bar ──────────────────────────────────────────────────── -->
      {#if selectedDoc}
        <div class="flex items-center gap-2.5 border-t border-[var(--border)] px-5 py-2 text-[11px] text-[var(--text-faint)]">
          <span>Son düzenleme: {relDate(selectedDoc.updated_at)}</span>
          {#if wordCount > 0}
            <span style="color:var(--border-strong)">·</span>
            <span>{wordCount} kelime</span>
          {/if}
          {#if checklistBlocks.length > 0}
            <span style="color:var(--border-strong)">·</span>
            <span>{checklistBlocks.length} görev, {doneCount} tamamlandı</span>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>
