<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { CalendarRange, History, ListChecks, Moon, NotebookPen, Rows3, Search, Sparkles } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { apiJson, apiSendJson } from '$lib/client/api';
  import { monthLabel, normalizeMonthKey } from '$lib/planner/dates';
  import type { SearchResults } from '$lib/planner/types';
  import { commandPaletteOpen, templateMode } from '$lib/stores';
  import { themeMode, toggleTheme } from '$lib/stores/theme';

  type CommandItem = {
    id: string;
    label: string;
    meta: string;
    icon: typeof Search;
    run: () => void | Promise<void>;
  };

  let query = $state('');
  let results = $state<SearchResults>({ tasks: [], notes: [], attachments: [] });
  let selectionIndex = $state(0);
  let searchVersion = 0;
  let inputEl = $state<HTMLInputElement | null>(null);

  const baseCommands = $derived<CommandItem[]>([
    {
      id: 'nav-week',
      label: 'Open week',
      meta: 'Execution workspace',
      icon: Rows3,
      run: () => goto('/week')
    },
    {
      id: 'nav-month',
      label: 'Open month',
      meta: 'Planning + capacity',
      icon: CalendarRange,
      run: () => goto('/month')
    },
    {
      id: 'nav-history',
      label: 'Open history',
      meta: 'Review + archive',
      icon: History,
      run: () => goto('/history')
    },
    {
      id: 'nav-one-time',
      label: 'Open one-time tasks',
      meta: 'Checklist workspace',
      icon: ListChecks,
      run: () => goto('/one-time')
    },
    {
      id: 'nav-notes',
      label: 'Open notes',
      meta: 'Reference space',
      icon: NotebookPen,
      run: () => goto('/notes')
    },
    {
      id: 'generate',
      label: 'Generate current month',
      meta: monthLabel(normalizeMonthKey($page.url.searchParams.get('month'))),
      icon: Sparkles,
      run: async () => {
        const monthKey =
          $page.url.pathname === '/month'
            ? normalizeMonthKey($page.url.searchParams.get('month'))
            : normalizeMonthKey(null);
        const response = await apiSendJson<{ createdBlocks: number; warnings: string[] }>(
          '/api/schedule/generate',
          'POST',
          { monthKey }
        );
        toast.success(`Generated ${response.createdBlocks} schedule block${response.createdBlocks === 1 ? '' : 's'}`);
        if (response.warnings.length > 0) {
          toast(response.warnings[0]);
        }
        await invalidateAll();
      }
    },
    {
      id: 'template-mode',
      label: $templateMode ? 'Disable template mode' : 'Enable template mode',
      meta: 'Focus the monthly template rail',
      icon: CalendarRange,
      run: () => {
        templateMode.update((value) => !value);
        void goto('/month');
      }
    },
    {
      id: 'theme',
      label: $themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      meta: 'Workspace appearance',
      icon: Moon,
      run: () => toggleTheme()
    }
  ]);

  const dynamicCommands = $derived<CommandItem[]>([
    ...results.tasks.map((task) => ({
      id: `task-${task.id}`,
      label: task.title_snapshot,
      meta: task.week_key ? `Week ${task.week_key}` : `Month ${task.month_key ?? ''}`,
      icon: Rows3,
      run: () => goto(task.week_key ? `/week?week=${task.week_key}` : `/month?month=${task.month_key ?? ''}`)
    })),
    ...results.notes.map((note) => ({
      id: `note-${note.id}`,
      label: note.title,
      meta: note.snippet,
      icon: note.kind === 'one-time' ? ListChecks : NotebookPen,
      run: () => goto(note.kind === 'one-time' ? `/one-time?doc=${note.id}` : `/notes?doc=${note.id}`)
    })),
    ...results.attachments.map((attachment) => ({
      id: `attachment-${attachment.id}`,
      label: attachment.file_name,
      meta: 'Attachment',
      icon: History,
      run: () => goto('/history')
    }))
  ]);

  const visibleItems = $derived(query.trim().length >= 2 ? dynamicCommands : baseCommands);

  $effect(() => {
    selectionIndex = 0;
  });

  $effect(() => {
    if ($commandPaletteOpen) {
      inputEl?.focus();
    }
  });

  $effect(() => {
    const currentQuery = query.trim();
    const version = ++searchVersion;

    if (!$commandPaletteOpen || currentQuery.length < 2) {
      results = { tasks: [], notes: [], attachments: [] };
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const next = await apiJson<SearchResults>(`/api/search?q=${encodeURIComponent(currentQuery)}`);
        if (version === searchVersion) {
          results = next;
        }
      } catch (error) {
        if (version === searchVersion) {
          results = { tasks: [], notes: [], attachments: [] };
        }
      }
    }, 140);

    return () => window.clearTimeout(timeout);
  });

  function closePalette() {
    commandPaletteOpen.set(false);
    query = '';
    results = { tasks: [], notes: [], attachments: [] };
    selectionIndex = 0;
  }

  async function activate(item: CommandItem) {
    try {
      await item.run();
      closePalette();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Command failed');
    }
  }

  onMount(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        commandPaletteOpen.update((value) => !value);
        return;
      }

      if (!$commandPaletteOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectionIndex = Math.min(selectionIndex + 1, Math.max(visibleItems.length - 1, 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectionIndex = Math.max(selectionIndex - 1, 0);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const target = visibleItems[selectionIndex];
        if (target) {
          void activate(target);
        }
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

{#if $commandPaletteOpen}
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-[12vh] backdrop-blur-[4px]">
    <button
      type="button"
      class="absolute inset-0"
      aria-label="Close command palette"
      onclick={closePalette}
    ></button>

    <div class="relative z-10 w-full max-w-2xl rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_32px_90px_-38px_rgba(0,0,0,0.45)]">
      <div class="flex items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
        <Search size={16} class="text-[var(--text-faint)]" />
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Jump anywhere, search tasks, or capture something quickly"
          class="w-full border-none bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <div class="text-[11px] uppercase tracking-[0.16em] text-[var(--text-faint)]">Esc</div>
      </div>

      <div class="mt-4 space-y-1">
        {#if visibleItems.length === 0}
          <div class="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
            No commands match yet.
          </div>
        {:else}
          {#each visibleItems as item, index (item.id)}
            <button
              type="button"
              class={`flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition-colors ${
                index === selectionIndex
                  ? 'border-[var(--border-strong)] bg-[var(--panel-soft)]'
                  : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-soft)]/70'
              }`}
              onclick={() => activate(item)}
            >
              <item.icon size={16} class="mt-0.5 text-[var(--text-faint)]" />
              <div class="min-w-0">
                <div class="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                <div class="mt-1 text-xs text-[var(--text-muted)]">{item.meta}</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
