<script lang="ts">
  import { Paperclip } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { authPassword } from '$lib/stores';
  import type { TaskAttachment } from '$lib/types';
  import AttachmentChip from './AttachmentChip.svelte';

  let {
    attachments = [],
    taskId = null,
    weekKey,
    readonly = false,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    attachments?: TaskAttachment[];
    taskId?: string | null;
    weekKey: string;
    readonly?: boolean;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);

  async function handleFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!taskId) {
      toast.error('This schedule item is not linked to a task yet');
      if (fileInput) fileInput.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('taskId', taskId);
    formData.append('weekKey', weekKey);

    let password = '';
    const unsub = authPassword.subscribe((value) => (password = value));
    unsub();

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: password ? { Authorization: `Bearer ${password}` } : {},
      body: formData
    });

    if (!response.ok) {
      const message = (await response.text().catch(() => '')).slice(0, 180);
      toast.error(message || 'Upload failed');
      if (fileInput) fileInput.value = '';
      return;
    }

    const attachment = (await response.json()) as TaskAttachment;
    onAttachmentAdded(attachment);
    if (fileInput) fileInput.value = '';
  }

  async function handleDeleteAttachment(id: string) {
    let password = '';
    const unsub = authPassword.subscribe((value) => (password = value));
    unsub();

    const response = await fetch(`/api/upload/${id}`, {
      method: 'DELETE',
      headers: password ? { Authorization: `Bearer ${password}` } : {}
    });

    if (!response.ok) {
      const message = (await response.text().catch(() => '')).slice(0, 180);
      toast.error(message || 'Delete failed');
      return;
    }

    onAttachmentDeleted(id);
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  {#each attachments as attachment (attachment.id)}
    <AttachmentChip {attachment} {readonly} onDelete={handleDeleteAttachment} />
  {/each}

  {#if !readonly}
    <button
      onclick={() => fileInput?.click()}
      disabled={!taskId}
      class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={taskId ? 'Attach file' : 'Attachment requires a linked task'}
      title={taskId ? 'Attach file' : 'Attachment requires a linked task'}
    >
      <Paperclip size={12} />
      Attach
    </button>
    <input bind:this={fileInput} type="file" class="hidden" onchange={handleFileChange} />
  {/if}
</div>
