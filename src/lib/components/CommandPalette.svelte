<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { CalendarRange, History, NotebookPen, Rows3, Search, Sparkles } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { apiJson, apiSendJson } from '$lib/client/api';
  import Badge from '$lib/components/ui/Badge.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { monthLabel, normalizeMonthKey } from '$lib/planner/dates';
  import type { SearchResults } from '$lib/planner/types';
  import { commandPaletteOpen, templateMode } from '$lib/stores';

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
      id: 'nav-planner',
      label: 'Open planner',
      meta: 'Place monthly work',
      icon: CalendarRange,
      run: () => goto('/planner')
    },
    {
      id: 'nav-history',
      label: 'Open history',
      meta: 'Review + archive',
      icon: History,
      run: () => goto('/history')
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
          $page.url.pathname === '/planner'
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
        void goto('/planner');
      }
    }
  ]);

  const dynamicCommands = $derived<CommandItem[]>([
    ...results.tasks.map((task) => ({
      id: `task-${task.id}`,
      label: task.title_snapshot,
      meta: task.week_key ? `Week ${task.week_key}` : `Month ${task.month_key ?? ''}`,
      icon: Rows3,
      run: () => goto(task.week_key ? `/week?week=${task.week_key}` : `/planner?month=${task.month_key ?? ''}`)
    })),
    ...results.notes.map((note) => ({
      id: `note-${note.id}`,
      label: note.title,
      meta: note.snippet,
      icon: NotebookPen,
      run: () => goto(note.kind === 'one-time' ? `/one-time?doc=${note.id}` : `/notes?note=${note.id}`)
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
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-[4px]">
    <button
      type="button"
      class="absolute inset-0"
      aria-label="Close command palette"
      onclick={closePalette}
    ></button>

    <div class="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--panel)]">
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <Search size={14} color="var(--text-faint)" />
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Jump anywhere or search tasks…"
          class="flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <Badge className="shrink-0">Esc</Badge>
      </div>

      <div class="max-h-[360px] overflow-y-auto p-1.5">
        {#if visibleItems.length === 0}
          <EmptyState
            compact
            title="No matching commands"
            description="Try a shorter search or jump to Calendar, Week, Notes, Planner, or History."
          />
        {:else}
          {#each visibleItems as item, index (item.id)}
            <button
              type="button"
              class={[
                'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors',
                index === selectionIndex
                  ? 'bg-[var(--panel-strong)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-soft)] hover:text-[var(--text-primary)]'
              ].join(' ')}
              onclick={() => activate(item)}
            >
              <item.icon size={13} />
              <span class="min-w-0 flex-1 truncate text-[var(--text-primary)]">{item.label}</span>
              <span class="shrink-0 text-[11px] text-[var(--text-faint)]">{item.meta}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
