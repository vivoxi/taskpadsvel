<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { CalendarRange, History, Moon, NotebookPen, Rows3, Search, Sparkles } from 'lucide-svelte';
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
  <div
    style="
      position:fixed; inset:0; z-index:50;
      display:flex; align-items:flex-start; justify-content:center;
      background:rgba(0,0,0,0.7);
      padding:12vh 16px 0;
      backdrop-filter:blur(4px);
    "
  >
    <button
      type="button"
      class="absolute inset-0"
      aria-label="Close command palette"
      onclick={closePalette}
    ></button>

    <div
      style="
        position:relative; z-index:10;
        width:100%; max-width:560px;
        background:var(--panel);
        border:1px solid var(--border-strong);
        border-radius:12px;
        overflow:hidden;
      "
    >
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)">
        <Search size={14} color="var(--text-faint)" />
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Jump anywhere or search tasks…"
          style="flex:1;background:transparent;border:none;outline:none;font-size:14px;color:var(--text-primary)"
        />
        <span style="font-size:10px;color:var(--text-faint);border:1px solid var(--border);padding:1px 6px;border-radius:4px">Esc</span>
      </div>

      <div style="padding:6px;max-height:360px;overflow-y:auto">
        {#if visibleItems.length === 0}
          <div style="padding:12px 10px;font-size:13px;color:var(--text-muted)">No commands match yet.</div>
        {:else}
          {#each visibleItems as item, index (item.id)}
            <button
              type="button"
              style="
                display:flex; align-items:center; gap:10px;
                width:100%; padding:8px 10px; border-radius:6px; border:none;
                background:{index === selectionIndex ? 'var(--panel-strong)' : 'transparent'};
                color:var(--text-secondary); font-size:13px; text-align:left; cursor:pointer;
                transition:background 100ms;
              "
              onclick={() => activate(item)}
            >
              <item.icon size={13} />
              <span style="color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{item.label}</span>
              <span style="font-size:11px;color:var(--text-faint);flex-shrink:0">{item.meta}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
