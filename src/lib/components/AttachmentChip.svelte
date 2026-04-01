<script lang="ts">
  import { ExternalLink, Paperclip, X } from 'lucide-svelte';
  import type { TaskAttachment } from '$lib/types';

  let {
    attachment,
    readonly = false,
    onDelete
  }: {
    attachment: TaskAttachment;
    readonly?: boolean;
    onDelete: (id: string) => void;
  } = $props();

  const isImage = $derived(attachment.mime_type?.startsWith('image/') ?? false);
</script>

<div class="group relative inline-flex items-center rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300">
  {#if attachment.url}
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors rounded-md"
      aria-label={`Open ${attachment.original_name ?? attachment.filename}`}
    >
      {#if isImage}
        <img
          src={attachment.url}
          alt={attachment.original_name ?? attachment.filename}
          class="h-8 w-8 rounded object-cover"
        />
      {:else}
        <Paperclip size={12} />
        <span class="max-w-[120px] truncate">{attachment.original_name ?? attachment.filename}</span>
        <ExternalLink size={11} class="text-zinc-400" />
      {/if}
    </a>
  {:else}
    <div class="inline-flex items-center gap-1.5 px-2 py-1">
      <Paperclip size={12} />
      <span class="max-w-[120px] truncate">{attachment.original_name ?? attachment.filename}</span>
    </div>
  {/if}

  {#if !readonly}
    <button
      onclick={() => onDelete(attachment.id)}
      class="mr-1 hidden group-hover:flex items-center justify-center rounded text-zinc-400 hover:text-red-500 transition-colors"
      aria-label="Delete attachment"
    >
      <X size={12} />
    </button>
  {/if}
</div>
