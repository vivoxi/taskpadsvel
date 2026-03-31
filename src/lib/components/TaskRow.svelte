<script lang="ts">
  import { Paperclip } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { useQueryClient } from '@tanstack/svelte-query';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import AttachmentChip from './AttachmentChip.svelte';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { debounce } from '$lib/debounce';
  import type { Task, TaskAttachment } from '$lib/types';

  let {
    task,
    attachments = [],
    readonly = false,
    weekKey = '',
    onToggle,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    task: Task;
    attachments?: TaskAttachment[];
    readonly?: boolean;
    weekKey?: string;
    onToggle: (id: string, completed: boolean) => void;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  let fileInput: HTMLInputElement;
  let notes = $state(task.notes ?? '');

  const saveNotes = debounce(async (value: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ notes: value })
      .eq('id', task.id);
    if (error) toast.error('Failed to save notes');
  }, 500);

  function onNotesInput(e: Event) {
    notes = (e.target as HTMLTextAreaElement).value;
    saveNotes(notes);
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !weekKey) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('taskId', task.id);
    formData.append('weekKey', weekKey);

    let password = '';
    const unsub = authPassword.subscribe((p) => (password = p));
    unsub();

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: password ? { Authorization: `Bearer ${password}` } : {},
      body: formData
    });

    if (!res.ok) {
      toast.error('Upload failed');
      return;
    }

    const attachment = await res.json();
    onAttachmentAdded(attachment);
    fileInput.value = '';
  }

  async function handleDeleteAttachment(id: string) {
    let password = '';
    const unsub = authPassword.subscribe((p) => (password = p));
    unsub();

    const res = await fetch(`/api/upload/${id}`, {
      method: 'DELETE',
      headers: password ? { Authorization: `Bearer ${password}` } : {}
    });

    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    onAttachmentDeleted(id);
  }
</script>

<div class="py-1">
  <Accordion.Root type="single" collapsible>
    <Accordion.Item value={task.id} class="border-none">
      <div class="flex items-center gap-3 px-1">
        <!-- Circular checkbox -->
        <button
          onclick={() => !readonly && onToggle(task.id, !task.completed)}
          disabled={readonly}
          class="shrink-0 h-5 w-5 rounded-full border-2 transition-colors flex items-center justify-center
            {task.completed
              ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100'
              : 'border-zinc-400 dark:border-zinc-600 hover:border-zinc-600 dark:hover:border-zinc-400'}
            {readonly ? 'cursor-default' : 'cursor-pointer'}"
          aria-label="{task.completed ? 'Mark incomplete' : 'Mark complete'}"
        >
          {#if task.completed}
            <svg viewBox="0 0 10 10" class="w-3 h-3" fill="none">
              <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>

        <Accordion.Trigger class="flex-1 text-left text-sm py-1 hover:no-underline
          {task.completed ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}">
          {task.title}
        </Accordion.Trigger>
      </div>

      <Accordion.Content>
        <div class="ml-8 mt-2 flex flex-col gap-3 pb-3">
          <textarea
            value={notes}
            oninput={onNotesInput}
            disabled={readonly}
            placeholder="Add notes..."
            rows={3}
            class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 resize-none outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
          ></textarea>

          <div class="flex flex-wrap items-center gap-2">
            {#each attachments as att (att.id)}
              <AttachmentChip
                attachment={att}
                {readonly}
                onDelete={handleDeleteAttachment}
              />
            {/each}

            {#if !readonly}
              <button
                onclick={() => fileInput.click()}
                class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-400 transition-colors"
              >
                <Paperclip size={12} />
                Attach
              </button>
              <input
                bind:this={fileInput}
                type="file"
                class="hidden"
                onchange={handleFileChange}
              />
            {/if}
          </div>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>
</div>
