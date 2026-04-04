<script lang="ts">
  import { useQueryClient } from '@tanstack/svelte-query';
  import { Check, ChevronDown, X } from 'lucide-svelte';
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
    autoEditTitle = false,
    showCompletionToggle = true,
    weekKey = '',
    onToggle,
    onTitleUpdate,
    onDeleteTask,
    onInsertTaskBelow,
    onAutoEditConsumed,
    onAttachmentAdded,
    onAttachmentDeleted
  }: {
    task: Task;
    attachments?: TaskAttachment[];
    randomCategories?: string[];
    readonly?: boolean;
    autoEditTitle?: boolean;
    showCompletionToggle?: boolean;
    weekKey?: string;
    onToggle: (id: string, completed: boolean) => void;
    onTitleUpdate: (id: string, title: string) => Promise<void> | void;
    onDeleteTask: (id: string) => Promise<void> | void;
    onInsertTaskBelow?: (
      taskId: string,
      indentLevel: number,
      category: string | null
    ) => Promise<void> | void;
    onAutoEditConsumed?: (taskId: string) => void;
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
  let indentLevel = $state(0);
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
    indentLevel = details.indentLevel;
    if (!editingTitle) {
      titleValue = task.title;
    }
  });

  $effect(() => {
    if (!autoEditTitle || readonly || editingTitle) return;
    titleValue = task.title;
    editingTitle = true;
    onAutoEditConsumed?.(task.id);
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
      nextCategory: string,
      nextIndentLevel: number
    ) => {
      const payload = serializeTaskDetails(
        nextNotes,
        parseEstimatedHoursInput(nextHours),
        parsePreferredWeekOfMonthInput(nextPreferredWeekOfMonth),
        (nextPreferredDay || null) as PreferredDay | null,
        nextCategory || null,
        nextIndentLevel
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
    saveTaskDetails(
      task.id,
      notes,
      estimatedHours,
      preferredWeekOfMonth,
      preferredDay,
      category,
      indentLevel
    );
  }

  function onEstimatedHoursInput(e: Event) {
    estimatedHours = (e.target as HTMLInputElement).value;
    saveTaskDetails(
      task.id,
      notes,
      estimatedHours,
      preferredWeekOfMonth,
      preferredDay,
      category,
      indentLevel
    );
  }

  function onPreferredWeekInput(e: Event) {
    preferredWeekOfMonth = (e.target as HTMLSelectElement).value;
    saveTaskDetails(
      task.id,
      notes,
      estimatedHours,
      preferredWeekOfMonth,
      preferredDay,
      category,
      indentLevel
    );
  }

  function onPreferredDayInput(e: Event) {
    preferredDay = (e.target as HTMLSelectElement).value;
    saveTaskDetails(
      task.id,
      notes,
      estimatedHours,
      preferredWeekOfMonth,
      preferredDay,
      category,
      indentLevel
    );
  }

  function onCategoryInput(e: Event) {
    category = (e.target as HTMLSelectElement).value;
    saveTaskDetails(
      task.id,
      notes,
      estimatedHours,
      preferredWeekOfMonth,
      preferredDay,
      category,
      indentLevel
    );
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

  async function commitTitleEdit(): Promise<boolean> {
    const nextTitle = titleValue.trim();
    editingTitle = false;

    if (!nextTitle) {
      titleValue = task.title;
      toast.error('Task title cannot be empty');
      return false;
    }

    if (nextTitle === task.title) return true;
    await onTitleUpdate(task.id, nextTitle);
    return true;
  }

  function onTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void (async () => {
        const committed = await commitTitleEdit();
        if (committed) {
          await onInsertTaskBelow?.(task.id, indentLevel, category || null);
        }
      })();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitleEdit();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIndentLevel = Math.max(
        0,
        Math.min(6, indentLevel + (e.shiftKey ? -1 : 1))
      );
      indentLevel = nextIndentLevel;
      saveTaskDetails(
        task.id,
        notes,
        estimatedHours,
        preferredWeekOfMonth,
        preferredDay,
        category,
        nextIndentLevel
      );
      return;
    }

    if (e.key === 'Backspace' && titleValue.trim() === '') {
      e.preventDefault();
      void confirmDeleteTask();
    }
  }

  async function confirmDeleteTask() {
    await onDeleteTask(task.id);
  }

</script>

<div
  class="group py-1 transition-[margin] duration-150"
  style:margin-left={`${indentLevel * 1.35}rem`}
>
  <Accordion.Root type="single">
    <Accordion.Item value={task.id} class="border-none">
      <div
        class={`flex items-center gap-3 rounded-xl px-2 py-1 transition-colors duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 ${
          indentLevel > 0
            ? 'border-l-2 border-zinc-200 pl-3 dark:border-zinc-800'
            : ''
        }`}
      >
        <!-- Circular checkbox -->
        {#if showCompletionToggle}
          <button
            onclick={() => !readonly && onToggle(task.id, !task.completed)}
            disabled={readonly}
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200
              {task.completed
                ? 'bg-orange-500 border-orange-500 dark:bg-orange-400 dark:border-orange-400'
                : 'border-zinc-300 hover:border-orange-400 dark:border-zinc-700 dark:hover:border-orange-300'}
              {readonly ? 'cursor-default' : 'cursor-pointer'}"
            aria-label="{task.completed ? 'Mark incomplete' : 'Mark complete'}"
          >
            {#if task.completed}
              <svg viewBox="0 0 10 10" class="h-3 w-3 animate-[pop-in_160ms_ease-out]" fill="none">
                <path
                  d="M2 5l2.5 2.5 3.5-4"
                  stroke="white"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
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
          <button
            onclick={startTitleEdit}
            class="flex-1 line-clamp-2 py-1 text-left text-sm transition-colors duration-200 {task.completed
              ? 'text-zinc-400 line-through dark:text-zinc-600'
              : 'text-zinc-900 dark:text-zinc-100'}"
          >
            {task.title.trim() || 'Untitled task'}
          </button>
          <Accordion.Trigger
            class="!flex-none !px-1.5 !py-1.5 !text-zinc-300 !opacity-100 transition-colors hover:!text-zinc-500 hover:!no-underline dark:!text-zinc-700 dark:hover:!text-zinc-400"
            aria-label="Toggle task details"
          >
            <ChevronDown size={14} />
          </Accordion.Trigger>
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

<style>
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.4);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
