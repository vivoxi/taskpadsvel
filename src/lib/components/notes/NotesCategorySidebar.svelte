<script lang="ts">
  import { ChevronRight, FileText, Folder, FolderPlus, Hash, Pencil, Plus, Trash2 } from 'lucide-svelte';
  import type { CategoryNode } from '$lib/notes/types';
  import type { NoteCategory } from '$lib/planner/types';

  let {
    categories,
    categoryTree,
    selectedCategoryId,
    expandedCategories,
    renamingCategoryId,
    renameValue,
    canCreateSubcategory,
    categoryCount,
    categoryPath,
    onSelectCategory,
    onToggleCategory,
    onCreateCategory,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDeleteCategory,
    onRenameInput,
    selectOnMount,
    mobile = false
  }: {
    categories: NoteCategory[];
    categoryTree: CategoryNode[];
    selectedCategoryId: string | null;
    expandedCategories: Set<string>;
    renamingCategoryId: string | null;
    renameValue: string;
    canCreateSubcategory: boolean;
    categoryCount: (categoryId: string) => number;
    categoryPath: (categoryId: string | null) => string;
    onSelectCategory: (categoryId: string | null) => void;
    onToggleCategory: (categoryId: string) => void;
    onCreateCategory: (parentId: string | null) => void | Promise<void>;
    onStartRename: (category: NoteCategory) => void;
    onCommitRename: (categoryId: string) => void | Promise<void>;
    onCancelRename: () => void;
    onDeleteCategory: (categoryId: string) => void | Promise<void>;
    onRenameInput: (value: string) => void;
    selectOnMount: (el: HTMLInputElement) => void;
    mobile?: boolean;
  } = $props();

  function handleRenameKeydown(event: KeyboardEvent, categoryId: string) {
    if (event.key === 'Enter') void onCommitRename(categoryId);
    if (event.key === 'Escape') onCancelRename();
  }
</script>

<aside class="{mobile ? 'flex' : 'hidden md:flex'} min-h-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--panel-soft)]">
  <div class="border-b border-[var(--border)] px-4 py-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Kategoriler</p>
        <p class="mt-1 text-xs text-[var(--text-muted)]">{categories.length} klasor</p>
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
        Kategori
      </button>
      <button
        type="button"
        disabled={!canCreateSubcategory}
        onclick={() => selectedCategoryId && onCreateCategory(selectedCategoryId)}
        title={canCreateSubcategory ? 'Secili ana kategoriye alt kategori ekle' : 'Once ana kategori sec'}
        class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FolderPlus size={13} />
        Alt
      </button>
    </div>
  </div>

  <div class="border-b border-[var(--border)] px-2 py-2">
    <button
      type="button"
      onclick={() => onSelectCategory(null)}
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors {selectedCategoryId === null ? 'bg-[var(--panel)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text-primary)]'}"
    >
      <FileText size={15} />
      <span class="min-w-0 flex-1 truncate">Tum notlar</span>
    </button>
  </div>

  <div class="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
    {#each categoryTree as category (category.id)}
      <div class="group/category">
        <div class="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--panel)]">
          {#if category.children.length > 0}
            <button
              type="button"
              onclick={() => onToggleCategory(category.id)}
              class="shrink-0 rounded p-1 text-[var(--text-faint)] transition hover:text-[var(--text-secondary)] {expandedCategories.has(category.id) ? 'rotate-90' : ''}"
              aria-label="Alt kategorileri ac"
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
              title={categoryPath(category.id)}
              class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors {selectedCategoryId === category.id ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            >
              <Hash size={13} class="shrink-0 text-[var(--accent)]" />
              <span class="min-w-0 flex-1 truncate">{category.name}</span>
              <span class="text-[11px] text-[var(--text-faint)]">{categoryCount(category.id)}</span>
            </button>
          {/if}

          <div class="hidden shrink-0 items-center gap-0.5 group-hover/category:flex">
            <button
              type="button"
              onclick={() => onCreateCategory(category.id)}
              class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--accent)]"
              aria-label="Alt kategori ekle"
            ><Plus size={11} /></button>
            <button
              type="button"
              onclick={() => onStartRename(category)}
              class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
              aria-label="Yeniden adlandir"
            ><Pencil size={10} /></button>
            <button
              type="button"
              onclick={() => onDeleteCategory(category.id)}
              class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
              aria-label="Sil"
            ><Trash2 size={10} /></button>
          </div>
        </div>

        {#if expandedCategories.has(category.id) && category.children.length > 0}
          <div class="ml-6 border-l border-[var(--border)] pl-2">
            {#each category.children as child (child.id)}
              <div class="group/subcategory flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--panel)]">
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
                    title={categoryPath(child.id)}
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors {selectedCategoryId === child.id ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                  >
                    <Hash size={12} class="shrink-0 text-[var(--accent)]" />
                    <span class="min-w-0 flex-1 truncate">{child.name}</span>
                    <span class="text-[11px] text-[var(--text-faint)]">{categoryCount(child.id)}</span>
                  </button>
                {/if}

                <div class="hidden shrink-0 items-center gap-0.5 group-hover/subcategory:flex">
                  <button
                    type="button"
                    onclick={() => onStartRename(child)}
                    class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
                    aria-label="Yeniden adlandir"
                  ><Pencil size={10} /></button>
                  <button
                    type="button"
                    onclick={() => onDeleteCategory(child.id)}
                    class="rounded p-1 text-[var(--text-faint)] hover:text-[var(--danger)]"
                    aria-label="Sil"
                  ><Trash2 size={10} /></button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</aside>
