<script lang="ts">
  import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { browser } from '$app/environment';
  import AttachmentChip from '$lib/components/AttachmentChip.svelte';
  import DayCard from '$lib/components/DayCard.svelte';
  import ScheduleDay from '$lib/components/ScheduleDay.svelte';
  import { normalizeScheduleDayBlocks } from '$lib/scheduleLayout';
  import { parseScheduleBlockDetails } from '$lib/scheduleBlockDetails';
  import { supabase } from '$lib/supabase';
  import { weekOffset, generatedWeeks, authPassword } from '$lib/stores';
  import { getWeekKey, getWeekDays, getWeekOfMonth, weekLabel, addWeeks, DAY_NAMES } from '$lib/weekUtils';
  import type { ScheduleBlock, WeeklyPlan, HistorySnapshot, Task, TaskAttachment, TaskType } from '$lib/types';

  const queryClient = useQueryClient();
  const today = new Date();
  const currentWeekKey = $derived(getWeekKey(addWeeks(today, $weekOffset)));
  const isPastWeek = $derived($weekOffset < 0);
  const weekDays = $derived(getWeekDays(currentWeekKey));
  const weekOfMonth = $derived(getWeekOfMonth(currentWeekKey));

  function isToday(dayIndex: number): boolean {
    if ($weekOffset !== 0) return false;
    return new Date().getDay() === (dayIndex + 1) % 7;
  }

  const planQuery = createQuery(() => ({
    queryKey: ['weekly_plan', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_plan')
        .select('*')
        .eq('week_key', currentWeekKey);
      if (error) throw error;
      return (data ?? []) as WeeklyPlan[];
    },
    enabled: browser && !isPastWeek
  }));

  function getPlanContent(day: string): string {
    return planQuery.data?.find((p) => p.day === day)?.content ?? '';
  }

  function getPlannerNotesPayload(): Record<string, string> {
    return Object.fromEntries(
      DAY_NAMES.map((day) => [day, getPlanContent(day).trim()]).filter(([, content]) => content.length > 0)
    );
  }

  const scheduleQuery = createQuery(() => ({
    queryKey: ['weekly_schedule', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_schedule')
        .select('*')
        .eq('week_key', currentWeekKey)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleBlock[];
    },
    enabled: browser
  }));

  function getBlocksForDay(day: string): ScheduleBlock[] {
    return (scheduleQuery.data ?? []).filter((b) => b.day === day);
  }

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks_all'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    enabled: browser && !isPastWeek
  }));

  function getLinkedTaskForBlock(block: ScheduleBlock): { id: string; type: TaskType } | null {
    const details = parseScheduleBlockDetails(block.notes);

    if (details.linkedTaskId) {
      const matchedTask = (tasksQuery.data ?? []).find((task) => task.id === details.linkedTaskId);
      if (matchedTask && (matchedTask.type === 'weekly' || matchedTask.type === 'monthly')) {
        return { id: matchedTask.id, type: matchedTask.type };
      }

      if (details.linkedTaskType) {
        return { id: details.linkedTaskId, type: details.linkedTaskType };
      }
    }

    const fallbackTask = (tasksQuery.data ?? []).find(
      (task) =>
        task.title === block.task_title && (task.type === 'weekly' || task.type === 'monthly')
    );

    return fallbackTask ? { id: fallbackTask.id, type: fallbackTask.type } : null;
  }

  const linkedTaskIds = $derived(
    Array.from(
      new Set(
        (scheduleQuery.data ?? [])
          .map((block) => getLinkedTaskForBlock(block)?.id ?? null)
          .filter((id): id is string => Boolean(id))
      )
    )
  );
  const linkedTaskIdsKey = $derived(linkedTaskIds.join(','));

  const scheduleAttachmentsQuery = createQuery(() => ({
    queryKey: ['schedule_attachments', currentWeekKey, linkedTaskIdsKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .in('task_id', linkedTaskIds);
      if (error) throw error;
      return (data ?? []) as TaskAttachment[];
    },
    enabled: browser && !isPastWeek && linkedTaskIds.length > 0
  }));

  let generating = $state(false);
  let autoGenAttempted = $state(false);

  $effect(() => {
    if (!browser || isPastWeek || autoGenAttempted) return;
    if (!scheduleQuery.data || !tasksQuery.data) return;
    if (scheduleQuery.data.length > 0) return;
    let alreadyGenerated = false;
    generatedWeeks.subscribe((s) => (alreadyGenerated = s.has(currentWeekKey)))();
    if (alreadyGenerated) return;
    autoGenAttempted = true;
    generateSchedule('rules');
  });

  async function generateSchedule(mode: 'rules' | 'ai' = 'rules') {
    if (isPastWeek || generating) return;
    generating = true;
    const tasks = tasksQuery.data ?? [];
    let password = '';
    authPassword.subscribe((p) => (password = p))();
    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { Authorization: `Bearer ${password}` } : {})
        },
        body: JSON.stringify({
          mode,
          weekKey: currentWeekKey,
          weekOfMonth,
          plannerNotes: getPlannerNotesPayload(),
          weeklyTasks: tasks.filter((t) => t.type === 'weekly'),
          monthlyTasks: tasks.filter((t) => t.type === 'monthly')
        })
      });
      if (!res.ok) throw new Error(await res.text());
      generatedWeeks.update((s) => new Set([...s, currentWeekKey]));
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.success(mode === 'ai' ? 'AI schedule generated' : 'Schedule generated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate schedule';
      toast.error(message.slice(0, 180));
      console.error(err);
    } finally {
      generating = false;
    }
  }

  const snapshotQuery = createQuery(() => ({
    queryKey: ['snapshot', currentWeekKey] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from('history_snapshots')
        .select('*')
        .eq('period_type', 'weekly')
        .eq('period_key', currentWeekKey)
        .maybeSingle();
      return data as HistorySnapshot | null;
    },
    enabled: browser && isPastWeek
  }));

  function getPastPlannerNote(day: string): string {
    return snapshotQuery.data?.planner_notes?.[day] ?? '';
  }

  function getPastCompletedTasks(): Task[] {
    return (snapshotQuery.data?.completed_tasks ?? []) as Task[];
  }

  function getPastMissedTasks(): Task[] {
    return (snapshotQuery.data?.missed_tasks ?? []) as Task[];
  }

  function getPastTasks(): Task[] {
    return [...getPastCompletedTasks(), ...getPastMissedTasks()];
  }

  function getPastCompletedScheduleBlocks(): ScheduleBlock[] {
    return (snapshotQuery.data?.completed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  function getPastMissedScheduleBlocks(): ScheduleBlock[] {
    return (snapshotQuery.data?.missed_schedule_blocks ?? []) as ScheduleBlock[];
  }

  const archiveAttachmentsQuery = createQuery(() => ({
    queryKey: ['archive_attachments', currentWeekKey] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .eq('week_key', currentWeekKey);
      if (error) throw error;
      return (data ?? []) as TaskAttachment[];
    },
    enabled: browser && isPastWeek
  }));

  function getPastAttachmentsForTask(taskId: string): TaskAttachment[] {
    return (archiveAttachmentsQuery.data ?? []).filter((attachment) => attachment.task_id === taskId);
  }

  function getPastLinkedTaskIdForBlock(block: ScheduleBlock): string | null {
    const details = parseScheduleBlockDetails(block.notes);
    if (details.linkedTaskId) return details.linkedTaskId;
    return getPastTasks().find((task) => task.title === block.task_title)?.id ?? null;
  }

  function getPastAttachmentsForBlock(block: ScheduleBlock): TaskAttachment[] {
    const taskId = getPastLinkedTaskIdForBlock(block);
    return taskId ? getPastAttachmentsForTask(taskId) : [];
  }

  async function persistBlocks(blocks: ScheduleBlock[]) {
    await Promise.all(
      blocks.map((block) =>
        supabase
          .from('weekly_schedule')
          .update({
            day: block.day,
            start_time: block.start_time,
            end_time: block.end_time,
            sort_order: block.sort_order
          })
          .eq('id', block.id)
      )
    );
  }

  async function onBlocksReordered(day: string, reordered: ScheduleBlock[]) {
    const normalizedBlocks = normalizeScheduleDayBlocks(day, reordered);
    if (!normalizedBlocks) {
      toast.error('Blocks no longer fit into work hours');
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      return;
    }

    const currentBlocks = (queryClient.getQueryData(['weekly_schedule', currentWeekKey]) ??
      scheduleQuery.data ??
      []) as ScheduleBlock[];

    const nextBlocks = [...currentBlocks.filter((b) => b.day !== day), ...normalizedBlocks];
    queryClient.setQueryData<ScheduleBlock[]>(['weekly_schedule', currentWeekKey], nextBlocks);

    try {
      await persistBlocks(normalizedBlocks);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.error('Failed to update schedule times');
      console.error(err);
    }
  }

  function onBlockUpdated(updated: ScheduleBlock) {
    queryClient.setQueryData<ScheduleBlock[]>(
      ['weekly_schedule', currentWeekKey],
      (prev) => prev?.map((block) => (block.id === updated.id ? updated : block)) ?? []
    );
  }

  function getAttachmentsForBlock(block: ScheduleBlock): TaskAttachment[] {
    const linkedTask = getLinkedTaskForBlock(block);
    if (!linkedTask) return [];
    return (scheduleAttachmentsQuery.data ?? []).filter((attachment) => attachment.task_id === linkedTask.id);
  }

  function onScheduleAttachmentAdded(_: TaskAttachment) {
    queryClient.invalidateQueries({ queryKey: ['schedule_attachments', currentWeekKey] });
    queryClient.invalidateQueries({ queryKey: ['attachments'] });
  }

  function onScheduleAttachmentDeleted(_: string) {
    queryClient.invalidateQueries({ queryKey: ['schedule_attachments', currentWeekKey] });
    queryClient.invalidateQueries({ queryKey: ['attachments'] });
  }

  async function moveBlockToDay(block: ScheduleBlock, targetDay: string) {
    if (targetDay === block.day) return;

    const currentBlocks = (queryClient.getQueryData(['weekly_schedule', currentWeekKey]) ??
      scheduleQuery.data ??
      []) as ScheduleBlock[];

    const sourceDayBlocks = currentBlocks
      .filter((item) => item.day === block.day && item.id !== block.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const targetDayBlocks = currentBlocks
      .filter((item) => item.day === targetDay)
      .sort((a, b) => a.sort_order - b.sort_order);

    const movedBlock = { ...block, day: targetDay, sort_order: targetDayBlocks.length };
    const normalizedSourceDayBlocks = normalizeScheduleDayBlocks(block.day, sourceDayBlocks);
    const normalizedTargetDayBlocks = normalizeScheduleDayBlocks(targetDay, [
      ...targetDayBlocks,
      movedBlock
    ]);

    if (!normalizedSourceDayBlocks || !normalizedTargetDayBlocks) {
      toast.error('Target day has no free work slot for this block');
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      return;
    }

    const untouchedBlocks = currentBlocks.filter(
      (item) => item.day !== block.day && item.day !== targetDay && item.id !== block.id
    );

    const nextBlocks = [...untouchedBlocks, ...normalizedSourceDayBlocks, ...normalizedTargetDayBlocks].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    queryClient.setQueryData<ScheduleBlock[]>(['weekly_schedule', currentWeekKey], nextBlocks);

    try {
      await persistBlocks([...normalizedSourceDayBlocks, ...normalizedTargetDayBlocks]);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
      toast.error('Failed to move schedule item');
      console.error(err);
    }
  }

  async function addBlockToDay(
    targetDay: string,
    draft: { start_time: string; end_time: string; task_title: string; notes: string }
  ) {
    const existingBlocks = (scheduleQuery.data ?? []).filter((b) => b.day === targetDay);
    const nextSortOrder = existingBlocks.length > 0
      ? Math.max(...existingBlocks.map((b) => b.sort_order)) + 1
      : 0;

    const { error: insertError } = await supabase.from('weekly_schedule').insert({
      week_key: currentWeekKey,
      day: targetDay,
      start_time: draft.start_time,
      end_time: draft.end_time,
      task_title: draft.task_title,
      notes: draft.notes,
      sort_order: nextSortOrder
    });

    if (insertError) {
      toast.error('Failed to add block');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
  }

  async function deleteBlock(blockId: string) {
    const { error: deleteError } = await supabase
      .from('weekly_schedule')
      .delete()
      .eq('id', blockId);

    if (deleteError) {
      toast.error('Failed to delete block');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['weekly_schedule', currentWeekKey] });
    toast.success('Block deleted');
  }
</script>

<svelte:head><title>This Week — TaskpadSvel</title></svelte:head>

<div class="flex h-full flex-col">
  <!-- Week navigation header -->
  <div class="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 shrink-0 sm:px-6 sm:py-4">
    <button
      onclick={() => weekOffset.update((n) => n - 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      <ChevronLeft size={16} />
    </button>
    <span class="min-w-0 flex-1 text-center text-sm font-medium text-zinc-900 dark:text-zinc-100 sm:min-w-[160px] sm:flex-none">
      {weekLabel(currentWeekKey)}
    </span>
    <button
      onclick={() => weekOffset.update((n) => n + 1)}
      class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      <ChevronRight size={16} />
    </button>
    {#if $weekOffset !== 0}
      <button
        onclick={() => weekOffset.set(0)}
        class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1"
      >
        This week
      </button>
    {/if}
    <div class="flex-1"></div>
    {#if isPastWeek}
      <span class="text-xs text-zinc-400 italic">Archived Week — Read Only</span>
    {:else}
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <button
          onclick={() => generateSchedule('rules')}
          disabled={generating}
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} class={generating ? 'animate-spin' : ''} />
          {generating ? 'Generating…' : 'Generate'}
        </button>
        <button
          onclick={() => generateSchedule('ai')}
          disabled={generating}
          class="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 disabled:opacity-50 transition-colors"
        >
          Generate with AI
        </button>
      </div>
    {/if}
  </div>

  <!-- Main content -->
  <div class="flex-1 overflow-auto">
    {#if isPastWeek}
      <!-- Past week: read from snapshot -->
      {#if snapshotQuery.isLoading}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400">Loading…</div>
      {:else if !snapshotQuery.data}
        <div class="flex items-center justify-center h-40 text-sm text-zinc-400 italic">
          No snapshot found for this week.
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-8 p-4 sm:p-6 xl:grid-cols-[2fr_3fr]">
          <!-- Left: Planner notes -->
          <div class="flex flex-col gap-4">
            <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Planner Notes
            </h3>
            {#each DAY_NAMES as day, i}
              <DayCard
                weekKey={currentWeekKey}
                {day}
                initialContent={getPastPlannerNote(day)}
                isToday={false}
                readonly={true}
              />
            {/each}
          </div>

          <!-- Right: Tasks -->
          <div class="flex flex-col gap-4">
            <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Tasks
            </h3>
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-green-600 dark:text-green-400">
                Completed
              </span>
              {#if getPastCompletedTasks().length === 0}
                <div class="text-sm text-zinc-400 italic">No completed tasks recorded.</div>
              {:else}
                {#each getPastCompletedTasks() as task (task.id)}
                  <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 text-sm text-zinc-400 line-through">
                    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400">
                      <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                        <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-zinc-400 font-mono uppercase">[{task.type}]</span>
                        <span>{task.title}</span>
                      </div>
                      {#if getPastAttachmentsForTask(task.id).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForTask(task.id) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="flex flex-col gap-2 pt-2">
              <span class="text-xs font-medium text-amber-600 dark:text-amber-400">
                Missed
              </span>
              {#if getPastMissedTasks().length === 0}
                <div class="text-sm text-zinc-400 italic">No missed tasks recorded.</div>
              {:else}
                {#each getPastMissedTasks() as task (task.id)}
                  <div class="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-zinc-400 font-mono uppercase">[{task.type}]</span>
                        <span>{task.title}</span>
                      </div>
                      {#if getPastAttachmentsForTask(task.id).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForTask(task.id) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="flex flex-col gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Schedule
              </span>

              <div class="flex flex-col gap-2">
                <span class="text-xs font-medium text-green-600 dark:text-green-400">
                  Completed Blocks
                </span>
                {#if getPastCompletedScheduleBlocks().length === 0}
                  <div class="text-sm text-zinc-400 italic">No completed schedule blocks recorded.</div>
                {:else}
                  {#each getPastCompletedScheduleBlocks() as block (block.id)}
                    <div class="flex items-start gap-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 px-3 py-2">
                      <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400">
                        <svg viewBox="0 0 10 10" class="h-3 w-3" fill="none">
                          <path d="M2 5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          {block.day} · {block.start_time}–{block.end_time}
                        </div>
                        <div class="text-sm text-zinc-500 line-through">{block.task_title}</div>
                        {#if getPastAttachmentsForBlock(block).length > 0}
                          <div class="mt-2 flex flex-wrap gap-2">
                            {#each getPastAttachmentsForBlock(block) as attachment (attachment.id)}
                              <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="flex flex-col gap-2 pt-2">
                <span class="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Missed Blocks
                </span>
                {#if getPastMissedScheduleBlocks().length === 0}
                  <div class="text-sm text-zinc-400 italic">No missed schedule blocks recorded.</div>
                {:else}
                  {#each getPastMissedScheduleBlocks() as block (block.id)}
                    <div class="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
                      <div class="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {block.day} · {block.start_time}–{block.end_time}
                      </div>
                      <div class="text-sm text-zinc-700 dark:text-zinc-300">{block.task_title}</div>
                      {#if getPastAttachmentsForBlock(block).length > 0}
                        <div class="mt-2 flex flex-wrap gap-2">
                          {#each getPastAttachmentsForBlock(block) as attachment (attachment.id)}
                            <AttachmentChip attachment={attachment} readonly={true} onDelete={() => {}} />
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Current/future week: editable planner + AI schedule -->
      <div class="grid grid-cols-1 gap-8 p-4 sm:p-6 xl:grid-cols-[2fr_3fr]">
        <!-- Left: Daily planner notes -->
        <div class="flex flex-col gap-4">
          <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Daily Planner
          </h3>
          {#if planQuery.isLoading}
            <div class="text-sm text-zinc-400">Loading…</div>
          {:else}
            {#each DAY_NAMES as day, i}
              <DayCard
                weekKey={currentWeekKey}
                {day}
                initialContent={getPlanContent(day)}
                isToday={isToday(i)}
                readonly={false}
              />
            {/each}
          {/if}
        </div>

        <!-- Right: AI schedule blocks -->
        <div class="flex flex-col gap-4">
          <h3 class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            AI Schedule
          </h3>
          {#if scheduleQuery.isLoading}
            <div class="text-sm text-zinc-400">Loading…</div>
          {:else if (scheduleQuery.data ?? []).length === 0 && !generating}
            <div class="text-sm text-zinc-400 italic py-4">
              No schedule yet. Click "Regenerate" to create one.
            </div>
          {:else if generating}
            <div class="flex items-center gap-2 text-sm text-zinc-400 py-4">
              <RefreshCw size={14} class="animate-spin" />
              Generating schedule with AI…
            </div>
          {:else}
            <div class="flex flex-col gap-6">
              {#each DAY_NAMES as day}
                {#if getBlocksForDay(day).length > 0}
                  <ScheduleDay
                    {day}
                    blocks={getBlocksForDay(day)}
                    weekKey={currentWeekKey}
                    readonly={false}
                    {onBlocksReordered}
                    onMoveBlockDay={moveBlockToDay}
                    {onBlockUpdated}
                    onDeleteBlock={deleteBlock}
                    onAddBlock={addBlockToDay}
                    {getLinkedTaskForBlock}
                    {getAttachmentsForBlock}
                    onAttachmentAdded={onScheduleAttachmentAdded}
                    onAttachmentDeleted={onScheduleAttachmentDeleted}
                  />
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
