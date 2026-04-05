<script module lang="ts">
  const RANDOM_CATEGORIES_STORAGE_KEY = 'random-task-categories:v1';
  const RANDOM_CATEGORY_ORDER_STORAGE_KEY = 'random-task-category-order:v1';
  const DEFAULT_CATEGORY = 'General';
</script>

<script lang="ts">
  import { browser } from '$app/environment';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { dndzone, dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
  import {
    Check,
    CheckSquare2,
    Filter,
    GripVertical,
    ListTodo,
    Pencil,
    Plus,
    Square,
    Trash2,
    X
  } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { apiJson, apiSendJson, canUseClientApi } from '$lib/client/api';
  import { EmptyState, SectionHeader } from '$lib/components/ui';
  import { getTaskAttachmentsForWeek } from '$lib/taskAttachments';
  import TaskRow from './TaskRow.svelte';
  import { parseTaskDetails, serializeTaskDetails } from '$lib/taskDetails';
  import { authPassword } from '$lib/stores';
  import { getWeekKey } from '$lib/weekUtils';
  import type { Task, TaskAttachment } from '$lib/types';

  const queryClient = useQueryClient();
  const weekKey = getWeekKey();
  const canAccessApi = $derived(canUseClientApi($authPassword));
  type CategoryItem = { id: string; name: string };

  const tasksQuery = createQuery(() => ({
    queryKey: ['tasks', 'random'] as const,
    queryFn: async () => apiJson<Task[]>('/api/tasks?type=random'),
    enabled: browser && canAccessApi
  }));

  const taskIds = $derived((tasksQuery.data ?? []).map((task) => task.id));
  const taskIdsKey = $derived(taskIds.join(','));

  const attachmentsQuery = createQuery(() => ({
    queryKey: ['attachments', 'random', taskIdsKey] as const,
    queryFn: async () => {
      return apiJson<TaskAttachment[]>(
        `/api/attachments?taskIds=${encodeURIComponent(taskIds.join(','))}&weekKey=${encodeURIComponent(weekKey)}`
      );
    },
    enabled: browser && canAccessApi && tasksQuery.isSuccess && taskIds.length > 0
  }));

  let categories = $state<string[]>([DEFAULT_CATEGORY]);
  let categoryOrderMap = $state<Record<string, string[]>>({});
  let localCategoryTasks = $state<Record<string, Task[]>>({});
  let localCategoryItems = $state<CategoryItem[]>([]);
  let categoryDrafts = $state<Record<string, string>>({});
  let categoryStateLoaded = $state(false);
  let editingCategory = $state<string | null>(null);
  let categoryDraft = $state('');
  let categoryInput = $state<HTMLInputElement | null>(null);
  let taskFilter = $state<'all' | 'active' | 'completed'>('all');
  let autoEditTaskId = $state<string | null>(null);

  $effect(() => {
    if (!browser || categoryStateLoaded) return;

    // Instant local fallback
    try {
      const storedCategories = localStorage.getItem(RANDOM_CATEGORIES_STORAGE_KEY);
      const storedOrderMap = localStorage.getItem(RANDOM_CATEGORY_ORDER_STORAGE_KEY);
      if (storedCategories) categories = JSON.parse(storedCategories) as string[];
      if (storedOrderMap) categoryOrderMap = JSON.parse(storedOrderMap) as Record<string, string[]>;
    } catch {
      categoryOrderMap = {};
    }

    if (!canAccessApi) return;

    apiJson<{ entries: Array<{ key: string; value: unknown }> }>(
      `/api/preferences?keys=${encodeURIComponent(
        `${RANDOM_CATEGORIES_STORAGE_KEY},${RANDOM_CATEGORY_ORDER_STORAGE_KEY}`
      )}`
    )
      .then((response) => {
        const entryMap = Object.fromEntries(response.entries.map((entry) => [entry.key, entry.value]));
        const categoriesValue = entryMap[RANDOM_CATEGORIES_STORAGE_KEY];
        const orderValue = entryMap[RANDOM_CATEGORY_ORDER_STORAGE_KEY];

        if (Array.isArray(categoriesValue)) {
          categories = categoriesValue as string[];
        }
        if (orderValue && typeof orderValue === 'object' && !Array.isArray(orderValue)) {
          categoryOrderMap = orderValue as Record<string, string[]>;
        }
        if (!categories.includes(DEFAULT_CATEGORY)) {
          categories = [DEFAULT_CATEGORY, ...categories];
        }
      })
      .finally(() => {
        categoryStateLoaded = true;
      });
  });

  $effect(() => {
    if (!browser || !categoryStateLoaded) return;
    localStorage.setItem(RANDOM_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    localStorage.setItem(RANDOM_CATEGORY_ORDER_STORAGE_KEY, JSON.stringify(categoryOrderMap));
    if (!canAccessApi) return;

    const updatedAt = new Date().toISOString();
    apiSendJson('/api/preferences', 'POST', {
      entries: [
        { key: RANDOM_CATEGORIES_STORAGE_KEY, value: categories, updatedAt },
        { key: RANDOM_CATEGORY_ORDER_STORAGE_KEY, value: categoryOrderMap, updatedAt }
      ]
    }).catch((error) => {
      console.error('Failed to save category state', error);
    });
  });

  $effect(() => {
    if (!editingCategory || !categoryInput) return;
    categoryInput.focus();
    categoryInput.select();
  });

  function getTaskCategory(task: Task): string {
    return parseTaskDetails(task.notes).category ?? DEFAULT_CATEGORY;
  }

  function getUniqueTaskCategories(tasks: Task[]): string[] {
    return Array.from(new Set(tasks.map(getTaskCategory)));
  }

  $effect(() => {
    if (!categoryStateLoaded) return;

    const tasks = tasksQuery.data ?? [];
    const taskCategories = getUniqueTaskCategories(tasks);
    const nextCategories = Array.from(
      new Set([DEFAULT_CATEGORY, ...categories.filter(Boolean), ...taskCategories])
    );

    const categoriesChanged =
      nextCategories.length !== categories.length ||
      nextCategories.some((category, index) => category !== categories[index]);

    if (categoriesChanged) {
      categories = nextCategories;
    }

    const nextOrderMap: Record<string, string[]> = {};
    for (const category of nextCategories) {
      const taskIdsForCategory = tasks
        .filter((task) => getTaskCategory(task) === category)
        .map((task) => task.id);
      const currentOrder = categoryOrderMap[category] ?? [];
      nextOrderMap[category] = [
        ...currentOrder.filter((id) => taskIdsForCategory.includes(id)),
        ...taskIdsForCategory.filter((id) => !currentOrder.includes(id))
      ];
    }

    const orderChanged = JSON.stringify(nextOrderMap) !== JSON.stringify(categoryOrderMap);
    if (orderChanged) {
      categoryOrderMap = nextOrderMap;
    }
  });

  function getTasksForCategory(category: string): Task[] {
    const tasks = (tasksQuery.data ?? []).filter((task) => getTaskCategory(task) === category);
    const order = categoryOrderMap[category] ?? [];
    const orderMap = new Map(order.map((id, index) => [id, index]));

    return [...tasks].sort((a, b) => {
      const aIndex = orderMap.get(a.id);
      const bIndex = orderMap.get(b.id);

      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  $effect(() => {
    if (!categoryStateLoaded) return;
    const nextLocalTasks: Record<string, Task[]> = {};
    for (const category of categories) {
      nextLocalTasks[category] = getTasksForCategory(category);
    }
    localCategoryTasks = nextLocalTasks;
  });

  $effect(() => {
    localCategoryItems = categories.map((category) => ({ id: category, name: category }));
  });

  $effect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const category of categories) {
      nextDrafts[category] = categoryDrafts[category] ?? '';
    }

    const changed =
      Object.keys(nextDrafts).length !== Object.keys(categoryDrafts).length ||
      Object.entries(nextDrafts).some(([category, draft]) => categoryDrafts[category] !== draft);

    if (changed) {
      categoryDrafts = nextDrafts;
    }
  });

  const totalCount = $derived((tasksQuery.data ?? []).length);
  const completedCount = $derived((tasksQuery.data ?? []).filter((task) => task.completed).length);
  const progressValue = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

  function isTaskVisible(task: Task): boolean {
    if (taskFilter === 'active') return !task.completed;
    if (taskFilter === 'completed') return task.completed;
    return true;
  }

  function getAttachmentsForTask(taskId: string): TaskAttachment[] {
    return getTaskAttachmentsForWeek(attachmentsQuery.data ?? [], taskId, weekKey);
  }

  function createUniqueCategoryName(base = 'New Category'): string {
    let nextName = base;
    let counter = 2;
    while (categories.includes(nextName)) {
      nextName = `${base} ${counter}`;
      counter += 1;
    }
    return nextName;
  }

  function startCategoryEdit(category: string) {
    editingCategory = category;
    categoryDraft = category;
  }

  async function saveCategoryEdit(previousCategory: string) {
    const nextCategory = categoryDraft.trim();
    editingCategory = null;

    if (!nextCategory || nextCategory === previousCategory) {
      categoryDraft = previousCategory;
      return;
    }

    if (categories.includes(nextCategory)) {
      toast.error('Category name already exists');
      categoryDraft = previousCategory;
      return;
    }

    const tasksToUpdate = (tasksQuery.data ?? []).filter(
      (task) => getTaskCategory(task) === previousCategory
    );

    try {
      for (const task of tasksToUpdate) {
        const details = parseTaskDetails(task.notes);
        const payload = serializeTaskDetails(
          details.notes,
          details.estimatedHours,
          details.preferredWeekOfMonth,
          details.preferredDay,
          nextCategory === DEFAULT_CATEGORY ? null : nextCategory,
          details.indentLevel
        );

        await apiSendJson(`/api/task/${task.id}`, 'PATCH', { notes: payload });
      }

      const { [previousCategory]: previousOrder = [], ...remainingOrder } = categoryOrderMap;
      categoryOrderMap = {
        ...remainingOrder,
        [nextCategory]: previousOrder
      };
      categories = categories.map((category) =>
        category === previousCategory ? nextCategory : category
      );

      queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
    } catch (error) {
      console.error(error);
      toast.error('Failed to rename category');
    }
  }

  async function deleteCategory(category: string) {
    if (!confirm(`Delete "${category}" category? Tasks inside will move to another category.`)) {
      return;
    }

    const remainingCategories = categories.filter((entry) => entry !== category);
    const targetCategory = remainingCategories[0] ?? DEFAULT_CATEGORY;
    const tasksToMove = (tasksQuery.data ?? []).filter((task) => getTaskCategory(task) === category);

    try {
      for (const task of tasksToMove) {
        const details = parseTaskDetails(task.notes);
        const payload = serializeTaskDetails(
          details.notes,
          details.estimatedHours,
          details.preferredWeekOfMonth,
          details.preferredDay,
          targetCategory === DEFAULT_CATEGORY ? null : targetCategory,
          details.indentLevel
        );

        await apiSendJson(`/api/task/${task.id}`, 'PATCH', { notes: payload });
      }

      const { [category]: removedOrder = [], ...nextOrderMap } = categoryOrderMap;
      if (removedOrder.length > 0) {
        nextOrderMap[targetCategory] = [
          ...(nextOrderMap[targetCategory] ?? []),
          ...removedOrder.filter((id) => !(nextOrderMap[targetCategory] ?? []).includes(id))
        ];
      }

      categoryOrderMap = nextOrderMap;
      categories = remainingCategories.length > 0 ? remainingCategories : [DEFAULT_CATEGORY];

      queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete category');
    }
  }

  function addCategory() {
    const nextCategory = createUniqueCategoryName();
    categories = [...categories, nextCategory];
    categoryOrderMap = { ...categoryOrderMap, [nextCategory]: [] };
    startCategoryEdit(nextCategory);
  }

  async function addTask(category = DEFAULT_CATEGORY) {
    const title = (categoryDrafts[category] ?? '').trim();
    if (!title) return;
    categoryDrafts = { ...categoryDrafts, [category]: '' };

    const payload = serializeTaskDetails(
      '',
      null,
      null,
      null,
      category === DEFAULT_CATEGORY ? null : category,
      0
    );
    try {
      await apiSendJson('/api/tasks', 'POST', {
        title,
        type: 'random',
        completed: false,
        notes: payload
      });
    } catch {
      toast.error('Failed to add task');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
  }

  async function addTaskBelow(anchorTaskId: string, indentLevel: number, taskCategory: string | null) {
    const category = taskCategory || DEFAULT_CATEGORY;
    const payload = serializeTaskDetails(
      '',
      null,
      null,
      null,
      category === DEFAULT_CATEGORY ? null : category,
      indentLevel
    );

    let data: { id: string } | null = null;

    try {
      data = await apiSendJson<{ id: string }>('/api/tasks', 'POST', {
        title: '',
        type: 'random',
        completed: false,
        notes: payload
      });
    } catch {
      data = null;
    }

    if (!data?.id) {
      toast.error('Failed to add task');
      return;
    }

    categoryOrderMap = {
      ...categoryOrderMap,
      [category]: [
        ...(categoryOrderMap[category] ?? []).flatMap((taskId) =>
          taskId === anchorTaskId ? [taskId, data.id] : [taskId]
        ),
        ...((categoryOrderMap[category] ?? []).includes(anchorTaskId) ? [] : [data.id])
      ]
    };
    taskFilter = 'all';
    autoEditTaskId = data.id;
    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
  }

  function onNewTaskKeydown(category: string, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTask(category);
    }
  }

  async function toggleTask(id: string, completed: boolean) {
    try {
      await apiSendJson(`/api/task/${id}`, 'PATCH', { completed });
    } catch {
      toast.error('Failed to update task');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
  }

  async function updateTaskTitle(id: string, title: string) {
    try {
      await apiSendJson(`/api/task/${id}`, 'PATCH', { title });
    } catch {
      toast.error('Failed to update task');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
  }

  async function deleteTask(id: string, askConfirmation = true) {
    const task = (tasksQuery.data ?? []).find((entry) => entry.id === id);
    if (askConfirmation && !confirm(`Delete "${task?.title || 'this task'}"?`)) return;

    try {
      await apiSendJson(`/api/task/${id}`, 'DELETE');
    } catch {
      toast.error('Failed to delete task');
      return;
    }

    for (const category of categories) {
      categoryOrderMap = {
        ...categoryOrderMap,
        [category]: (categoryOrderMap[category] ?? []).filter((taskId) => taskId !== id)
      };
    }

    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
    queryClient.invalidateQueries({ queryKey: ['attachments', 'random'] });
    toast.success('Task deleted');
  }

  async function resetAll() {
    if (!confirm('Reset all random tasks?')) return;

    await apiSendJson('/api/tasks', 'PATCH', {
      taskType: 'random',
      updates: { completed: false }
    });
    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
    toast.success('All tasks reset');
  }

  async function setAllRandomTasksCompleted(completed: boolean) {
    try {
      await apiSendJson('/api/tasks', 'PATCH', {
        taskType: 'random',
        updates: { completed }
      });
    } catch {
      toast.error('Failed to update tasks');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
  }

  async function clearCompletedTasks() {
    const completedTasks = (tasksQuery.data ?? []).filter((task) => task.completed);
    if (completedTasks.length === 0) return;
    if (!confirm(`Delete ${completedTasks.length} completed task(s)?`)) return;

    for (const task of completedTasks) {
      await deleteTask(task.id, false);
    }
  }

  function onAttachmentAdded(_: TaskAttachment) {
    queryClient.invalidateQueries({ queryKey: ['attachments', 'random'] });
  }

  function onAttachmentDeleted(_: string) {
    queryClient.invalidateQueries({ queryKey: ['attachments', 'random'] });
  }

  function handleCategoryOrderConsider(category: string, event: CustomEvent<DndEvent<Task>>) {
    localCategoryTasks = {
      ...localCategoryTasks,
      [category]: event.detail.items.map((task) => {
        const details = parseTaskDetails(task.notes);
        return {
          ...task,
          notes: serializeTaskDetails(
            details.notes,
            details.estimatedHours,
            details.preferredWeekOfMonth,
            details.preferredDay,
            category === DEFAULT_CATEGORY ? null : category,
            details.indentLevel
          )
        };
      })
    };
  }

  async function handleCategoryOrderFinalize(category: string, event: CustomEvent<DndEvent<Task>>) {
    handleCategoryOrderConsider(category, event);

    const movedTasks = event.detail.items.filter((task) => getTaskCategory(task) !== category);
    for (const task of movedTasks) {
      const details = parseTaskDetails(task.notes);
      const payload = serializeTaskDetails(
        details.notes,
        details.estimatedHours,
        details.preferredWeekOfMonth,
        details.preferredDay,
        category === DEFAULT_CATEGORY ? null : category,
        details.indentLevel
      );

      try {
        await apiSendJson(`/api/task/${task.id}`, 'PATCH', { notes: payload });
      } catch {
        toast.error('Failed to move task');
        queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
        return;
      }
    }

    categoryOrderMap = {
      ...categoryOrderMap,
      [category]: event.detail.items.map((task) => task.id)
    };

    if (movedTasks.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'random'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks_all'] });
    }
  }

  function handleCategoryListConsider(event: CustomEvent<DndEvent<CategoryItem>>) {
    localCategoryItems = event.detail.items;
  }

  function handleCategoryListFinalize(event: CustomEvent<DndEvent<CategoryItem>>) {
    localCategoryItems = event.detail.items;
    categories = event.detail.items.map((item) => item.name);
  }
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
  <div class="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <ListTodo size={15} />
        {completedCount} of {totalCount} complete
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={addCategory}
          class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <Plus size={13} />
          New category
        </button>
        <button
          onclick={() => setAllRandomTasksCompleted(completedCount !== totalCount)}
          class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          {#if completedCount === totalCount && totalCount > 0}
            <Square size={13} />
            Uncheck all
          {:else}
            <CheckSquare2 size={13} />
            Check all
          {/if}
        </button>
        <button
          onclick={clearCompletedTasks}
          class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300"
        >
          <Trash2 size={13} />
          Clear completed
        </button>
        <button
          onclick={resetAll}
          class="text-xs text-zinc-400 transition-colors hover:text-red-500"
        >
          Reset all
        </button>
      </div>
    </div>

    <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200/60 dark:bg-zinc-800">
      <div
        class="h-full rounded-full bg-orange-500 transition-all duration-300 dark:bg-orange-400"
        style:width={`${progressValue}%`}
      ></div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <Filter size={12} />
      {#each ['all', 'active', 'completed'] as filterOption}
        <button
          onclick={() => (taskFilter = filterOption as typeof taskFilter)}
          class={`rounded-full px-3 py-1 transition-colors ${
            taskFilter === filterOption
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-white text-zinc-500 hover:text-zinc-900 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          {filterOption}
        </button>
      {/each}
    </div>
  </div>

  {#if tasksQuery.error}
    <EmptyState message="Random taskler yuklenemedi." class="py-8" />
  {:else if tasksQuery.isLoading}
    <EmptyState message="Random taskler yukleniyor." class="py-8" />
  {:else}
    <div
      use:dndzone={{ items: localCategoryItems, flipDurationMs: 150, type: 'category-board' }}
      onconsider={handleCategoryListConsider}
      onfinalize={handleCategoryListFinalize}
      class="flex flex-col gap-8"
    >
      {#each localCategoryItems as categoryItem (categoryItem.id)}
        {@const category = categoryItem.name}
        <section class="group relative">
          <div class="pointer-events-none absolute -left-7 top-3 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto active:cursor-grabbing dark:text-zinc-600">
            <GripVertical size={16} />
          </div>

          <div class="min-w-0 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            {#if editingCategory === category}
              <input
                bind:this={categoryInput}
                bind:value={categoryDraft}
                onblur={() => saveCategoryEdit(category)}
                onkeydown={(event) => {
                  if (event.key === 'Enter') saveCategoryEdit(category);
                  if (event.key === 'Escape') editingCategory = null;
                }}
                class="min-w-0 flex-1 bg-transparent text-sm font-medium uppercase tracking-widest text-zinc-500 outline-none dark:text-zinc-300"
              />
              <button
                onclick={() => saveCategoryEdit(category)}
                class="rounded-md p-1.5 text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Save category name"
              >
                <Check size={16} />
              </button>
              <button
                onclick={() => (editingCategory = null)}
                class="rounded-md p-1.5 text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Cancel category edit"
              >
                <X size={16} />
              </button>
            {:else}
              <button
                onclick={() => startCategoryEdit(category)}
                class="text-left transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-zinc-400"
              >
                <SectionHeader class="text-zinc-500 dark:text-zinc-300">{category}</SectionHeader>
              </button>
              <button
                onclick={() => startCategoryEdit(category)}
                class="rounded-md p-1.5 text-zinc-300 transition-colors hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-300"
                aria-label="Rename category"
              >
                <Pencil size={14} />
              </button>
              {#if categories.length > 1}
                <button
                  onclick={() => deleteCategory(category)}
                  class="rounded-md p-1.5 text-zinc-300 transition-colors hover:text-red-500 dark:text-zinc-600"
                  aria-label="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              {/if}
            {/if}
          </div>

          <div
            use:dragHandleZone={{
              items: (localCategoryTasks[category] ?? []).filter((task) => isTaskVisible(task)),
              flipDurationMs: 150,
              type: 'random-tasks',
              dragDisabled: taskFilter !== 'all',
              dropTargetStyle: {
                outline: '2px dashed rgba(249, 115, 22, 0.4)',
                outlineOffset: '2px'
              }
            }}
            onconsider={(event) => handleCategoryOrderConsider(category, event)}
            onfinalize={(event) => handleCategoryOrderFinalize(category, event)}
            class="flex min-h-10 flex-col divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            {#each (localCategoryTasks[category] ?? []).filter((task) => isTaskVisible(task)) as task (task.id)}
              <div class="group relative flex items-start gap-2">
                <div class="relative pt-2">
                  <button
                    type="button"
                    use:dragHandle
                    class={`rounded-md px-1 py-1 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600 ${
                      taskFilter === 'all'
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-not-allowed'
                    }`}
                    aria-label="Task actions and drag handle"
                  >
                    <GripVertical size={14} />
                  </button>
                </div>
                <div class="min-w-0 flex-1 pr-10">
                  <TaskRow
                    {task}
                    attachments={getAttachmentsForTask(task.id)}
                    randomCategories={categories}
                    autoEditTitle={autoEditTaskId === task.id}
                    {weekKey}
                    onToggle={toggleTask}
                    onTitleUpdate={updateTaskTitle}
                    onDeleteTask={deleteTask}
                    onInsertTaskBelow={addTaskBelow}
                    onAutoEditConsumed={() => {
                      autoEditTaskId = null;
                    }}
                    {onAttachmentAdded}
                    {onAttachmentDeleted}
                  />
                </div>
                <button
                  type="button"
                  onclick={() => deleteTask(task.id)}
                  class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-white/80 text-zinc-400 opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:border-red-200 hover:bg-white hover:text-red-500 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 group-hover:opacity-100 dark:bg-zinc-900/80 dark:text-zinc-500 dark:hover:border-red-500/20 dark:hover:bg-zinc-900 dark:hover:text-red-400"
                  aria-label={`Delete ${task.title || 'task'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            {/each}
          </div>

          {#if (localCategoryTasks[category] ?? []).filter((task) => isTaskVisible(task)).length === 0}
            <EmptyState
              class="py-8"
              message={taskFilter === 'all'
                ? 'Bu kategoride henuz gorev yok.'
                : 'Bu filtrede gorunecek gorev yok.'}
            />
          {/if}

          <div class="mt-2 flex items-center gap-2 rounded-lg px-1 py-2">
            <div class="h-1.5 w-1.5 rounded-full bg-zinc-700"></div>
            <input
              value={categoryDrafts[category] ?? ''}
              oninput={(event) => {
                categoryDrafts = {
                  ...categoryDrafts,
                  [category]: (event.target as HTMLInputElement).value
                };
              }}
              onkeydown={(event) => onNewTaskKeydown(category, event)}
              placeholder="Gorev ekle..."
              class="w-full bg-transparent text-sm text-zinc-400 outline-none transition-colors duration-150 placeholder:text-zinc-700 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-200"
            />
          </div>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
