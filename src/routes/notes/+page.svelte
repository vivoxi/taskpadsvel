<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { FileText, Paperclip, Plus, Search, Trash2, Upload } from 'lucide-svelte';
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

  const displayedDocs = $derived(
    debouncedQuery.trim()
      ? data.view.documents.filter((d) =>
          d.title.toLowerCase().includes(debouncedQuery.toLowerCase())
        )
      : data.view.documents
  );

  // ── Progressive preview cache ─────────────────────────────────────────────
  let previewCache = $state<Record<string, string>>({});

  $effect(() => {
    const docId = data.view.selectedDocumentId;
    if (!docId) return;
    const first = data.view.blocks.find((b) => b.type !== 'divider' && b.text?.trim());
    if (first?.text) {
      const txt = first.text.replace(/<[^>]+>/g, '').trim().slice(0, 120);
      previewCache = { ...previewCache, [docId]: txt };
    }
  });

  function getPreview(docId: string): string {
    return previewCache[docId] ?? '';
  }

  // ── Status bar ────────────────────────────────────────────────────────────
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
  const attachmentImages = $derived(data.view.attachments.filter(isImage));
  const attachmentFiles = $derived(data.view.attachments.filter((a) => !isImage(a)));

  // ── Title action ──────────────────────────────────────────────────────────
  const currentTitle = $derived(selectedDoc?.title ?? 'Untitled');

  function titleSync(el: HTMLElement, title: string) {
    el.textContent = title;
    return {
      update(next: string) {
        if (document.activeElement !== el) el.textContent = next;
      }
    };
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  function relDateShort(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'bugün';
    if (diffDays === 1) return 'dün';
    if (diffDays < 7) return `${diffDays}g`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}h`;
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

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

<div class="flex h-full overflow-hidden">

  <!-- ══════════════════════════════════════════════════════════════════
       LEFT PANEL — Note list
  ══════════════════════════════════════════════════════════════════ -->
  <aside
    class="hidden w-[260px] shrink-0 flex-col border-r border-[var(--border)] md:flex"
    style="background:var(--panel-soft)"
  >

    <!-- Header -->
    <div class="flex items-center justify-between px-4 pb-2 pt-4">
      <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        Notes{data.view.documents.length > 0 ? ` · ${data.view.documents.length}` : ''}
      </span>
      <button
        type="button"
        onclick={createDocument}
        class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text-primary)]"
        aria-label="New note"
      >
        <Plus size={14} />
      </button>
    </div>

    <!-- Search -->
    <div class="px-3 pb-2">
      <div class="flex items-center gap-1.5 rounded-md bg-[var(--bg)] px-2.5 py-1.5">
        <Search size={11} color="var(--text-faint)" />
        <input
          bind:value={searchQuery}
          placeholder="Ara…"
          class="min-w-0 flex-1 border-none bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>
    </div>

    <!-- Note list -->
    <div class="no-scrollbar flex-1 overflow-y-auto py-1">
      {#each displayedDocs as doc (doc.id)}
        {@const isSelected = doc.id === data.view.selectedDocumentId}
        <a href={`/notes?doc=${doc.id}`} class="block px-2 py-px">
          <div
            class={`rounded-md px-3 py-2.5 transition-colors duration-100 ${isSelected ? 'bg-[var(--panel)]' : 'hover:bg-white/[0.03]'}`}
            style={isSelected ? 'box-shadow: inset 2px 0 0 var(--accent);' : ''}
          >
            <div class="mb-0.5 flex items-baseline justify-between gap-2">
              <div
                class="truncate text-[13px] font-medium leading-snug"
                style="color:{isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}"
              >{doc.title}</div>
              <div class="shrink-0 text-[10px] text-[var(--text-faint)]">{relDateShort(doc.updated_at)}</div>
            </div>
            <div class="line-clamp-2 text-[11px] leading-[1.5] text-[var(--text-muted)]">
              {getPreview(doc.id) || ' '}
            </div>
          </div>
        </a>
      {/each}

      {#if displayedDocs.length === 0}
        <p class="px-5 py-3 text-[12px] text-[var(--text-muted)]">
          {debouncedQuery.trim() ? 'Eşleşen not yok.' : 'Henüz not yok.'}
        </p>
      {/if}
    </div>
  </aside>

  <!-- ══════════════════════════════════════════════════════════════════
       RIGHT PANEL — Editor
  ══════════════════════════════════════════════════════════════════ -->
  <div class="group/editor relative flex min-w-0 flex-1 flex-col" style="background:var(--panel)">

    <!-- Mobile: notes switcher via <details> -->
    <details class="border-b border-[var(--border)] md:hidden">
      <summary
        class="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-sm"
        style="list-style:none"
      >
        <span class="flex-1 truncate font-medium text-[var(--text-primary)]">{currentTitle}</span>
        <span class="text-[var(--text-faint)]" style="font-size:10px">▾ Notlar</span>
      </summary>
      <div class="max-h-52 overflow-y-auto border-t border-[var(--border)] px-2 py-1">
        {#each data.view.documents as doc (doc.id)}
          <a
            href={`/notes?doc=${doc.id}`}
            class="block rounded-md px-3 py-2 text-sm transition-colors {doc.id === data.view.selectedDocumentId ? 'bg-[var(--panel-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--panel-soft)]/70'}"
          >{doc.title}</a>
        {/each}
        <button
          type="button"
          onclick={createDocument}
          class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <Plus size={13} /> Yeni not
        </button>
      </div>
    </details>

    <!-- Actions revealed on editor hover -->
    <div class="absolute right-5 top-4 z-10 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/editor:opacity-100">
      <label
        class="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-faint)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
      >
        <Upload size={11} />
        {uploading ? '…' : 'Attach'}
        <input type="file" class="hidden" disabled={uploading} onchange={uploadAttachment} />
      </label>
      <button
        type="button"
        onclick={deleteDocument}
        class="flex items-center justify-center rounded-full border border-[var(--border)] p-1.5 text-[var(--text-faint)] transition-colors hover:border-red-900/40 hover:text-red-500"
        aria-label="Delete note"
      >
        <Trash2 size={12} />
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-[700px] px-8 pb-16 pt-10 md:px-12">

        <!-- Title -->
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
          class="mb-7 w-full bg-transparent text-[var(--text-primary)] outline-none"
          style="font-size:32px;font-weight:700;letter-spacing:-0.04em;line-height:1.15;word-break:break-word"
        ></div>

        <!-- Attachments -->
        {#if data.view.attachments.length > 0}
          <div class="mb-7 rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
            <div class="mb-2.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              <span>Attachments · {data.view.attachments.length}</span>
            </div>

            {#if attachmentImages.length > 0}
              <div class="mb-2.5 grid grid-cols-4 gap-2">
                {#each attachmentImages as att (att.id)}
                  <div class="group/img relative overflow-hidden rounded-lg border border-[var(--border)]">
                    <a href={attachmentHref(att.file_path)} target="_blank" rel="noreferrer">
                      <img
                        src={attachmentHref(att.file_path)}
                        alt={att.file_name}
                        class="aspect-square w-full object-cover opacity-80 transition-opacity group-hover/img:opacity-100"
                        loading="lazy"
                      />
                    </a>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white/70 transition-colors hover:text-red-400 group-hover/img:flex"
                      aria-label="Remove"
                    ><Trash2 size={10} /></button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if attachmentFiles.length > 0}
              <div class="space-y-1">
                {#each attachmentFiles as att (att.id)}
                  <div class="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                    <span class="shrink-0 text-[var(--text-faint)]">
                      {#if att.mime_type === 'application/pdf'}<FileText size={13} />{:else}<Paperclip size={13} />{/if}
                    </span>
                    <a
                      href={attachmentHref(att.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      class="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >{att.file_name}</a>
                    <span class="shrink-0 text-[10px] text-[var(--text-faint)]">{relDateShort(att.created_at)}</span>
                    <button
                      type="button"
                      onclick={() => deleteAttachment(att.id)}
                      class="shrink-0 rounded p-0.5 text-[var(--text-faint)] transition-colors hover:text-red-500"
                      aria-label="Remove"
                    ><Trash2 size={11} /></button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Editor -->
        <BlockEditor
          sourceKey={data.view.selectedDocumentId}
          blocks={data.view.blocks}
          emptyLabel="Yazmaya başla…"
          onCommit={saveBlocks}
        />
      </div>
    </div>

    <!-- Status bar -->
    {#if selectedDoc}
      <div
        class="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-8 py-2 text-[11px] text-[var(--text-faint)] md:px-12"
      >
        <span>{relDate(selectedDoc.updated_at)}</span>
        {#if wordCount > 0}
          <span style="color:var(--border-strong)">·</span>
          <span>{wordCount} kelime</span>
        {/if}
        {#if checklistBlocks.length > 0}
          <span style="color:var(--border-strong)">·</span>
          <span>{doneCount}/{checklistBlocks.length} görev</span>
        {/if}
      </div>
    {/if}
  </div>
</div>
