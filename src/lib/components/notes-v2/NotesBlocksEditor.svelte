<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PanelCard from '$lib/components/ui/PanelCard.svelte';
  import { createNoteBlock } from '$lib/notes-v2/validation';
  import type { NoteBlock, NoteBlockType } from '$lib/notes-v2/types';

  // TODO(notes-editor): Unify NotesBlocksEditor and BlockEditor around shared block-row
  // presentation primitives and keyboard affordances while keeping planner's richer commands
  // separate from Notes v2's deliberately plain text inputs.

  export let blocks: NoteBlock[] = [];
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    change: NoteBlock[];
    blur: void;
  }>();

  const addableBlocks: Array<{ type: NoteBlockType; label: string }> = [
    { type: 'paragraph', label: 'Text' },
    { type: 'heading', label: 'Heading' },
    { type: 'checklist', label: 'Checklist' },
    { type: 'bullet', label: 'Bullet' },
    { type: 'divider', label: 'Divider' }
  ];

  function emit(nextBlocks: NoteBlock[]) {
    dispatch('change', nextBlocks);
  }

  function updateBlock(index: number, patch: Partial<NoteBlock>) {
    emit(blocks.map((block, currentIndex) => (currentIndex === index ? { ...block, ...patch } as NoteBlock : block)));
  }

  function addBlock(type: NoteBlockType) {
    emit([...blocks, createNoteBlock(type)]);
  }

  function removeBlock(index: number) {
    emit(blocks.filter((_, currentIndex) => currentIndex !== index));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const nextBlocks = [...blocks];
    const [moved] = nextBlocks.splice(index, 1);
    nextBlocks.splice(nextIndex, 0, moved);
    emit(nextBlocks);
  }

  function notifyBlur() {
    dispatch('blur');
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap gap-2">
    {#each addableBlocks as option}
      <Button variant="secondary" size="sm" onclick={() => addBlock(option.type)} disabled={disabled}>
        <Plus size={14} />
        {option.label}
      </Button>
    {/each}
  </div>

  {#if blocks.length === 0}
    <EmptyState
      compact
      title="Start with a block"
      description="Use text, heading, checklist, bullet, or divider to shape the note."
    />
  {/if}

  {#each blocks as block, index (block.id)}
    <PanelCard padded={false} className="overflow-hidden bg-[var(--panel-soft)]">
      <div class="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <div class="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
          {block.type}
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="!px-1.5 !py-1.5"
            onclick={() => moveBlock(index, -1)}
            disabled={disabled || index === 0}
            ariaLabel="Move block up"
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="!px-1.5 !py-1.5"
            onclick={() => moveBlock(index, 1)}
            disabled={disabled || index === blocks.length - 1}
            ariaLabel="Move block down"
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="!px-1.5 !py-1.5 hover:!text-[var(--danger)]"
            onclick={() => removeBlock(index)}
            disabled={disabled}
            ariaLabel="Delete block"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div class="px-3 py-3">

      {#if block.type === 'heading'}
        <input
          class="w-full border-none bg-transparent text-2xl font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          placeholder="Heading"
          value={block.text}
          oninput={(event) => updateBlock(index, { text: event.currentTarget.value })}
          onblur={notifyBlur}
          disabled={disabled}
        />
      {:else if block.type === 'paragraph'}
        <textarea
          class="min-h-28 w-full resize-y border-none bg-transparent text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          placeholder="Write a note"
          value={block.text}
          oninput={(event) => updateBlock(index, { text: event.currentTarget.value })}
          onblur={notifyBlur}
          disabled={disabled}
        ></textarea>
      {:else if block.type === 'checklist'}
        <label class="flex items-start gap-3">
          <input
            type="checkbox"
            class="mt-1 h-4 w-4 rounded border-[var(--border)] bg-[var(--panel)] text-[var(--accent)]"
            checked={block.checked}
            onchange={(event) => updateBlock(index, { checked: event.currentTarget.checked })}
            onblur={notifyBlur}
            disabled={disabled}
          />
          <input
            class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            placeholder="Checklist item"
            value={block.text}
            oninput={(event) => updateBlock(index, { text: event.currentTarget.value })}
            onblur={notifyBlur}
            disabled={disabled}
          />
        </label>
      {:else if block.type === 'bullet'}
        <label class="flex items-start gap-3">
          <span class="pt-1 text-[var(--text-secondary)]">
            <Minus size={14} />
          </span>
          <input
            class="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
            placeholder="Bullet item"
            value={block.text}
            oninput={(event) => updateBlock(index, { text: event.currentTarget.value })}
            onblur={notifyBlur}
            disabled={disabled}
          />
        </label>
      {:else}
        <hr class="border-t border-[var(--border)]" />
      {/if}
      </div>
    </PanelCard>
  {/each}
</div>
