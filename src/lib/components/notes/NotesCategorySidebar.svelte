<script lang="ts">
  import {
    ChevronRight,
    Clock3,
    FileText,
    Folder,
    FolderPlus,
    Hash,
    MoreHorizontal,
    Palette,
    Pencil,
    Plus,
    Star,
    Trash2
  } from 'lucide-svelte';
  import type { CategoryNode, SmartFolderId } from '$lib/notes/types';
  import type { NoteCategory, NoteTag } from '$lib/planner/types';

  const COLOR_PRESETS = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899'
  ];

  let {
    categories,
    categoryTree,
    selectedCategoryId,
    activeSmartFolder,
    smartFolders,
    tags = [],
    activeTagId = null,
    sidebarWidth,
    expandedCategories,
    renamingCategoryId,
    renameValue,
    canCreateSubcategory,
    categoryCount,
    categoryPath,
    tagCount,
    onSelectSmartFolder,
    onSelectCategory,
    onSelectTag,
    onMoveDocumentToCategory,
    onToggleCategory,
    onCreateCategory,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDeleteCategory,
    onRenameInput,
    onUpdateCategoryColor,
    onStartSidebarResize,
    selectOnMount,
    mobile = false
  }: {
    categories: NoteCategory[];
    categoryTree: CategoryNode[];
    selectedCategoryId: string | null;
    activeSmartFolder: SmartFolderId;
    smartFolders: Array<{ id: SmartFolderId; label: string; count: number }>;
    tags?: NoteTag[];
    activeTagId?: string | null;
    sidebarWidth: number;
    expandedCategories: Set<string>;
    renamingCategoryId: string | null;
    renameValue: string;
    canCreateSubcategory: boolean;
    categoryCount: (categoryId: string) => number;
    categoryPath: (categoryId: string | null) => string;
    tagCount?: (tagId: string) => number;
    onSelectSmartFolder: (folderId: SmartFolderId) => void;
    onSelectCategory: (categoryId: string | null) => void;
    onSelectTag?: (tagId: string) => void;
    onMoveDocumentToCategory?: (documentId: string, categoryId: string | null) => void | Promise<void>;
    onToggleCategory: (categoryId: string) => void;
    onCreateCategory: (parentId: string | null) => void | Promise<void>;
    onStartRename: (category: NoteCategory) => void;
    onCommitRename: (categoryId: string) => void | Promise<void>;
    onCancelRename: () => void;
    onDeleteCategory: (categoryId: string) => void | Promise<void>;
    onRenameInput: (value: string) => void;
    onUpdateCategoryColor: (categoryId: string, color: string) => void | Promise<void>;
    onStartSidebarResize: (event: PointerEvent) => void;
    selectOnMount: (el: HTMLInputElement) => void;
    mobile?: boolean;
  } = $props();

  let colorMenuId = $state<string | null>(null);

  function handleRenameKeydown(event: KeyboardEvent, categoryId: string) {
    if (event.key === 'Enter') void onCommitRename(categoryId);
    if (event.key === 'Escape') onCancelRename();
  }

  function smartFolderIcon(folderId: SmartFolderId) {
    return folderId;
  }

  function dropNote(event: DragEvent, categoryId: string | null) {
    const noteId =
      event.dataTransfer?.getData('application/x-taskpad-note-id') ||
      event.dataTransfer?.getData('text/plain');
    if (!noteId) return;
    event.preventDefault();
    void onMoveDocumentToCategory?.(noteId, categoryId);
  }
</script>

<aside
  class="{mobile ? 'flex' : 'hidden md:flex'} relative min-h-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--panel-soft)]"
  style={mobile ? '' : `width:${sidebarWidth}px`}
>
  <div class="border-b border-[var(--border)] px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Folders</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{categories.length} folders</p>
      </div>
      <Folder size={17} class="mt-0.5 shrink-0 text-[var(--accent)]" />
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2">
      <button
        type="button"
        onclick={() => onCreateCategory(null)}
        class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      >
        <Plus size={13} />
        Folder
      </button>
      <button
        type="button"
        disabled={!canCreateSubcategory}
        onclick={() => selectedCategoryId && onCreateCategory(selectedCategoryId)}
        title={canCreateSubcategory ? 'Add subfolder to selected folder' : 'Select a top-level folder first'}
        class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FolderPlus size={13} />
        Sub
      </button>
    </div>
  </div>

  <div class="border-b border-[var(--border)] px-2 py-2">
    {#each smartFolders as folder (folder.id)}
      <button
        type="button"
        onclick={() => onSelectSmartFolder(folder.id)}
        ondragover={(event) => {
          if (folder.id === 'all') event.preventDefault();
        }}
        ondrop={(event) => folder.id === 'all' && dropNote(event, null)}
        class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors {activeSmartFolder === folder.id && selectedCategoryId === null ? 'bg-[var(--panel)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'}"
      >
        {#if smartFolderIcon(folder.id) === 'all'}<FileText size={15} />
        {:else if smartFolderIcon(folder.id) === 'starred'}<Star size={15} />
        {:else if smartFolderIcon(folder.id) === 'recent'}<Clock3 size={15} />
        {:else}<Trash2 size={15} />{/if}
        <span class="min-w-0 flex-1 truncate">{folder.label}</span>
        <span class="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-faint)]">{folder.count}</span>
      </button>
    {/each}
  </div>

  <div class="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
    {#each categoryTree as category (category.id)}
      <div class="group/category">
        <div
          role="group"
          class="relative flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--panel)]"
          oncontextmenu={(event) => {
            event.preventDefault();
            colorMenuId = category.id;
          }}
        >
          {#if category.children.length > 0}
            <button
              type="button"
              onclick={() => onToggleCategory(category.id)}
              class="shrink-0 rounded p-1 text-[var(--text-faint)] transition hover:text-[var(--text-secondary)] {expandedCategories.has(category.id) ? 'rotate-90' : ''}"
              aria-label="Toggle subfolders"
            >
              <ChevronRight size={13} />
            </button>
          {:else}
            <span class="w-[22px] shrink-0"></span>
          {/if}

          {#if renamingCategoryId === category.id}
            <input
              use:selectOnMount
              value={renameValue}
              oninput={(event) => onRenameInput(event.currentTarget.value)}
              onblur={() => onCommitRename(category.id)}
              onkeydown={(event) => handleRenameKeydown(event, category.id)}
              class="min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
            />
          {:else}
            <button
              type="button"
              onclick={() => onSelectCategory(category.id)}
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => dropNote(event, category.id)}
              title={categoryPath(category.id)}
              class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors {selectedCategoryId === category.id ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style={`background:${category.color ?? '#6366f1'}`}></span>
              <span class="min-w-0 flex-1 truncate">{category.name}</span>
              <span class="text-[11px] text-[var(--text-faint)]">{categoryCount(category.id)}</span>
            </button>
          {/if}

          <div class="hidden shrink-0 items-center gap-0.5 group-hover/category:flex">
            <button type="button" onclick={() => onCreateCategory(category.id)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--accent)]" aria-label="Add subfolder"><Plus size={11} /></button>
            <button type="button" onclick={() => onStartRename(category)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)]" aria-label="Rename folder"><Pencil size={10} /></button>
            <button type="button" onclick={() => (colorMenuId = colorMenuId === category.id ? null : category.id)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--accent)]" aria-label="Pick color"><MoreHorizontal size={11} /></button>
            <button type="button" onclick={() => onDeleteCategory(category.id)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--danger)]" aria-label="Delete folder"><Trash2 size={10} /></button>
          </div>

          {#if colorMenuId === category.id}
            <div class="absolute right-1 top-8 z-30 w-44 rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[var(--shadow-card)]">
              <div class="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <Palette size={12} />
                Color
              </div>
              <div class="grid grid-cols-4 gap-1.5">
                {#each COLOR_PRESETS as color (color)}
                  <button
                    type="button"
                    class="h-7 rounded-md border border-[var(--border)]"
                    style={`background:${color}`}
                    aria-label={`Color ${color}`}
                    onclick={() => {
                      colorMenuId = null;
                      void onUpdateCategoryColor(category.id, color);
                    }}
                  ></button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div
          class="overflow-hidden transition-[max-height,opacity] duration-150 {expandedCategories.has(category.id) && category.children.length > 0 ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}"
        >
          <div class="ml-6 border-l border-[var(--border)] pl-2">
            {#each category.children as child (child.id)}
              <div class="group/subcategory relative flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--panel)]">
                {#if renamingCategoryId === child.id}
                  <input
                    use:selectOnMount
                    value={renameValue}
                    oninput={(event) => onRenameInput(event.currentTarget.value)}
                    onblur={() => onCommitRename(child.id)}
                    onkeydown={(event) => handleRenameKeydown(event, child.id)}
                    class="min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
                  />
                {:else}
                  <button
                    type="button"
                    onclick={() => onSelectCategory(child.id)}
                    ondragover={(event) => event.preventDefault()}
                    ondrop={(event) => dropNote(event, child.id)}
                    title={categoryPath(child.id)}
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors {selectedCategoryId === child.id ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                  >
                    <span class="h-2 w-2 shrink-0 rounded-full" style={`background:${child.color ?? category.color ?? '#6366f1'}`}></span>
                    <span class="min-w-0 flex-1 truncate">{child.name}</span>
                    <span class="text-[11px] text-[var(--text-faint)]">{categoryCount(child.id)}</span>
                  </button>
                {/if}

                <div class="hidden shrink-0 items-center gap-0.5 group-hover/subcategory:flex">
                  <button type="button" onclick={() => onStartRename(child)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)]" aria-label="Rename folder"><Pencil size={10} /></button>
                  <button type="button" onclick={() => (colorMenuId = colorMenuId === child.id ? null : child.id)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--accent)]" aria-label="Pick color"><MoreHorizontal size={11} /></button>
                  <button type="button" onclick={() => onDeleteCategory(child.id)} class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--danger)]" aria-label="Delete folder"><Trash2 size={10} /></button>
                </div>

                {#if colorMenuId === child.id}
                  <div class="absolute right-1 top-8 z-30 w-44 rounded-md border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[var(--shadow-card)]">
                    <div class="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <Palette size={12} />
                      Color
                    </div>
                    <div class="grid grid-cols-4 gap-1.5">
                      {#each COLOR_PRESETS as color (color)}
                        <button
                          type="button"
                          class="h-7 rounded-md border border-[var(--border)]"
                          style={`background:${color}`}
                          aria-label={`Color ${color}`}
                          onclick={() => {
                            colorMenuId = null;
                            void onUpdateCategoryColor(child.id, color);
                          }}
                        ></button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/each}

    {#if tags.length > 0}
      <div class="mt-5 border-t border-[var(--border)] pt-3">
        <div class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Tags</div>
        {#each tags as tag (tag.id)}
          <button
            type="button"
            onclick={() => onSelectTag?.(tag.id)}
            class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors {activeTagId === tag.id ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'}"
          >
            <Hash size={13} class="text-[var(--accent)]" />
            <span class="min-w-0 flex-1 truncate">{tag.name}</span>
            <span class="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-faint)]">{tagCount?.(tag.id) ?? 0}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !mobile}
    <button
      type="button"
      class="absolute right-[-3px] top-0 hidden h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--accent-subtle)] md:block"
      aria-label="Resize sidebar"
      onpointerdown={onStartSidebarResize}
    ></button>
  {/if}
</aside>
