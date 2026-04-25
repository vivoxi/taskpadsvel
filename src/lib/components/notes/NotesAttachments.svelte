<script lang="ts">
  import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-svelte';
  import type { TaskAttachment } from '$lib/planner/types';

  let {
    images,
    files,
    attachmentHref,
    relDateShort,
    onDeleteAttachment
  }: {
    images: TaskAttachment[];
    files: TaskAttachment[];
    attachmentHref: (filePath: string) => string;
    relDateShort: (iso: string) => string;
    onDeleteAttachment: (attachmentId: string) => void | Promise<void>;
  } = $props();

  const total = $derived(images.length + files.length);
</script>

{#if total > 0}
  <section class="mb-8 space-y-4 border-y border-[var(--border)] py-5">
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
      <Paperclip size={14} />
      <span>Ekler · {total}</span>
    </div>

    {#if images.length > 0}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {#each images as attachment (attachment.id)}
          <figure class="group/image overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)]">
            <a href={attachmentHref(attachment.file_path)} target="_blank" rel="noreferrer" class="block">
              <img
                src={attachmentHref(attachment.file_path)}
                alt={attachment.file_name}
                class="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </a>
            <figcaption class="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-muted)]">
              <ImageIcon size={13} class="shrink-0 text-[var(--accent)]" />
              <a
                href={attachmentHref(attachment.file_path)}
                target="_blank"
                rel="noreferrer"
                class="min-w-0 flex-1 truncate text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]"
              >
                {attachment.file_name}
              </a>
              <button
                type="button"
                onclick={() => onDeleteAttachment(attachment.id)}
                class="rounded p-1 text-[var(--text-faint)] opacity-100 transition hover:text-[var(--danger)] md:opacity-0 md:group-hover/image:opacity-100"
                aria-label="Resmi kaldir"
              >
                <Trash2 size={12} />
              </button>
            </figcaption>
          </figure>
        {/each}
      </div>
    {/if}

    {#if files.length > 0}
      <div class="grid gap-2 sm:grid-cols-2">
        {#each files as attachment (attachment.id)}
          <div class="group/file flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--panel-soft)] text-[var(--accent)]">
              {#if attachment.mime_type === 'application/pdf'}<FileText size={18} />{:else}<Paperclip size={18} />{/if}
            </div>
            <div class="min-w-0 flex-1">
              <a
                href={attachmentHref(attachment.file_path)}
                target="_blank"
                rel="noreferrer"
                class="block truncate text-sm font-semibold text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]"
              >
                {attachment.file_name}
              </a>
              <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                {attachment.mime_type ?? 'dosya'} · {relDateShort(attachment.created_at)}
              </p>
            </div>
            <button
              type="button"
              onclick={() => onDeleteAttachment(attachment.id)}
              class="rounded p-1 text-[var(--text-faint)] opacity-100 transition hover:text-[var(--danger)] md:opacity-0 md:group-hover/file:opacity-100"
              aria-label="Dosyayi kaldir"
            >
              <Trash2 size={13} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}
