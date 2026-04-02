<script lang="ts">
  import { useQueryClient } from '@tanstack/svelte-query';
  import { Check, Pencil, Trash2, X } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import AttachmentManager from './AttachmentManager.svelte';
  import { supabase } from '$lib/supabase';
  import { authPassword } from '$lib/stores';
  import { debounce } from '$lib/debounce';
  import {
    PREFERRED_DAY_OPTIONS,
    parseEstimatedHoursInput,
    parseTaskDetails,
    type PreferredDay,
    serializeTaskDetails
  } from '$lib/taskDetails';
  import type { Task, TaskAttachment } from '$lib/types';

  let {
    task,
    attachments = [],
    randomCategories = [],
    readonly = false,
    showCompletionToggle = true,
    weekKey = '',
    onToggle,
    onTitleUpdate,
    onDeleteTask,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    task: Task;
    attachments?: TaskAttachment[];
    randomCategories?: string[];
    readonly?: boolean;
    showCompletionToggle?: boolean;
    weekKey?: string;
    onToggle: (id: string, completed: boolean) => void;
    onTitleUpdate: (id: string, title: string) => Promise<void> | void;
    onDeleteTask: (id: string) => Promise<void> | void;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
    onAttachmentDeleted: (id: string) => void;
  } = $props();

  const queryClient = useQueryClient();
  let titleInput = $state<HTMLInputElement | null>(null);
  let notes = $state('');
  let estimatedHours = $state('');
  let preferredWeekOfMonth = $state('');
  let preferredDay = $state('');
  let category = $state('');
  let editingTitle = $state(false);
  let titleValue = $state('');

  $effect(() => {
    const details = parseTaskDetails(task.notes);
    notes = details.notes;
    estimatedHours = details.estimatedHours === null ? '' : String(details.estimatedHours);
    preferredWeekOfMonth =
      details.preferredWeekOfMonth === null ? '' : String(details.preferredWeekOfMonth);
    preferredDay = details.preferredDay ?? '';
    category = details.category ?? '';
    if (!editingTitle) {
      titleValue = task.title;
    }
  });

  $effect(() => {
    if (!editingTitle || !titleInput) return;
    titleInput.focus();
    titleInput.select();
  });

  function parsePreferredWeekOfMonthInput(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) return null;
    return parsed;
  }

  const saveTaskDetails = debounce(
    async (
      taskId: string,
      nextNotes: string,
      nextHours: string,
      nextPreferredWeekOfMonth: string,
      nextPreferredDay: string,
      nextCategory: string
    ) => {
      const payload = serializeTaskDetails(
        nextNotes,
        parseEstimatedHoursInput(nextHours),
        parsePreferredWeekOfMonthInput(nextPreferredWeekOfMonth),
        (nextPreferredDay || null) as PreferredDay | null,
        nextCategory || null
      );

      let password = '';
      const unsub = authPassword.subscribe((value) => (password = value));
      unsub();

      const res = await fetch(`/api/task/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { Authorization: `Bearer ${password}` } : {})
        },
        body: JSON.stringify({ notes: payload })
      });

      if (!res.ok) {
        toast.error('Failed to save task details');
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
    },
    500
  );

  function onNotesInput(e: Event) {
    notes = (e.target as HTMLTextAreaElement).value;
    saveTaskDetails(task.id, notes, estimatedHours, preferredWeekOfMonth, preferredDay, category);
  }

  function onEstimatedHoursInput(e: Event) {
    estimatedHours = (e.target as HTMLInputElement).value;
    saveTaskDetails(task.id, notes, estimatedHours, preferredWeekOfMonth, preferredDay, category);
  }

  function onPreferredWeekInput(e: Event) {
    preferredWeekOfMonth = (e.target as HTMLSelectElement).value;
    saveTaskDetails(task.id, notes, estimatedHours, preferredWeekOfMonth, preferredDay, category);
  }

  function onPreferredDayInput(e: Event) {
    preferredDay = (e.target as HTMLSelectElement).value;
    saveTaskDetails(task.id, notes, estimatedHours, preferredWeekOfMonth, preferredDay, category);
  }

  function onCategoryInput(e: Event) {
    category = (e.target as HTMLSelectElement).value;
    saveTaskDetails(task.id, notes, estimatedHours, preferredWeekOfMonth, preferredDay, category);
  }

  function startTitleEdit() {
    if (readonly) return;
    titleValue = task.title;
    editingTitle = true;
  }

  function cancelTitleEdit() {
    editingTitle = false;
    titleValue = task.title;
  }

  async function commitTitleEdit() {
    const nextTitle = titleValue.trim();
    editingTitle = false;

    if (!nextTitle) {
      titleValue = task.title;
      toast.error('Task title cannot be empty');
      return;
    }

    if (nextTitle === task.title) return;
    await onTitleUpdate(task.id, nextTitle);
  }

  function onTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitleEdit();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitleEdit();
    }
  }

  async function confirmDeleteTask() {
    if (!confirm(`Delete "${task.title}"?`)) return;
    await onDeleteTask(task.id);
  }

</script>

<div class="group py-1">
  <Accordion.Root type="single">
    <Accordion.Item value={task.id} class="border-none">
      <div class="flex items-center gap-3 px-1">
        <!-- Circular checkbox -->
        {#if showCompletionToggle}
          <button
            onclick={() => !readonly && onToggle(task.id, !task.completed)}
            disabled={readonly}
            class="shrink-0 h-5 w-5 rounded-full border-2 transition-colors flex items-center justify-center
              {task.completed
                ? 'bg-orange-500 border-orange-500 dark:bg-orange-400 dark:border-orange-400'
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
        {/if}

        {#if editingTitle}
          <input
            bind:this={titleInput}
            bind:value={titleValue}
            onblur={commitTitleEdit}
            onkeydown={onTitleKeydown}
            class="flex-1 bg-transparent border-b border-zinc-300 dark:border-zinc-600 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
          />
          <div class="flex items-center gap-1">
            <button
              onclick={(event) => {
                event.stopPropagation();
                commitTitleEdit();
              }}
              class="rounded p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              aria-label="Save task title"
            >
              <Check size={14} />
            </button>
            <button
              onclick={(event) => {
                event.stopPropagation();
                cancelTitleEdit();
              }}
              class="rounded p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              aria-label="Cancel task title edit"
            >
              <X size={14} />
            </button>
          </div>
        {:else}
          <Accordion.Trigger class="flex-1 text-left text-sm py-1 hover:no-underline
            {task.completed ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}">
            {task.title}
          </Accordion.Trigger>
          {#if !readonly}
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onclick={(event) => {
                  event.stopPropagation();
                  startTitleEdit();
                }}
                class="rounded p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                aria-label="Edit task title"
              >
                <Pencil size={14} />
              </button>
              <button
                onclick={(event) => {
                  event.stopPropagation();
                  confirmDeleteTask();
                }}
                class="rounded p-1 text-zinc-400 hover:text-red-500 transition-colors"
                aria-label="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </div>
          {/if}
        {/if}
      </div>

      <Accordion.Content>
        <div class="ml-8 mt-2 flex flex-col gap-3 pb-3">
          {#if task.type !== 'random'}
            <div class="flex items-center gap-2">
              <label
                for={`task-hours-${task.id}`}
                class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide"
              >
                Hours Needed
              </label>
              <input
                id={`task-hours-${task.id}`}
                type="number"
                min="0.25"
                step="0.25"
                inputmode="decimal"
                value={estimatedHours}
                oninput={onEstimatedHoursInput}
                disabled={readonly}
                placeholder="e.g. 2"
                class="w-24 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
              />
            </div>
          {/if}

          {#if task.type === 'random'}
            <div class="flex items-center gap-2">
              <label
                for={`task-category-${task.id}`}
                class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide"
              >
                Category
              </label>
              <select
                id={`task-category-${task.id}`}
                value={category}
                oninput={onCategoryInput}
                disabled={readonly}
                class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
              >
                {#each randomCategories as randomCategory}
                  <option value={randomCategory}>{randomCategory}</option>
                {/each}
              </select>
            </div>
          {/if}

          {#if task.type === 'weekly' || task.type === 'monthly'}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {#if task.type === 'monthly'}
                <div class="flex items-center gap-2">
                  <label
                    for={`task-preferred-week-${task.id}`}
                    class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide"
                  >
                    Preferred Week
                  </label>
                  <select
                    id={`task-preferred-week-${task.id}`}
                    value={preferredWeekOfMonth}
                    oninput={onPreferredWeekInput}
                    disabled={readonly}
                    class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
                  >
                    <option value="">Any week</option>
                    <option value="1">Week 1</option>
                    <option value="2">Week 2</option>
                    <option value="3">Week 3</option>
                    <option value="4">Week 4</option>
                  </select>
                </div>
              {/if}

              <div class="flex items-center gap-2">
                <label
                  for={`task-preferred-day-${task.id}`}
                  class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide"
                >
                  Preferred Day
                </label>
                <select
                  id={`task-preferred-day-${task.id}`}
                  value={preferredDay}
                  oninput={onPreferredDayInput}
                  disabled={readonly}
                  class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
                >
                  <option value="">Any day</option>
                  {#each PREFERRED_DAY_OPTIONS as day}
                    <option value={day}>{day}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}

          <textarea
            value={notes}
            oninput={onNotesInput}
            disabled={readonly}
            placeholder="Add notes or scheduling details..."
            rows={3}
            class="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 resize-none outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
          ></textarea>

          <AttachmentManager
            {attachments}
            taskId={task.id}
            {weekKey}
            {readonly}
            {onAttachmentAdded}
            {onAttachmentDeleted}
          />
        </div>
      </Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>
</div>
