import type { BlockType, PlannerBlock } from '$lib/planner/types';

export function createBlock(type: BlockType): PlannerBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: '',
    checked: type === 'checklist' ? false : null,
    level: type === 'heading' ? 2 : null
  };
}

export function normalizeBlocks(value: unknown): PlannerBlock[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const block = entry as Record<string, unknown>;
    const type = block.type;
    if (type !== 'heading' && type !== 'paragraph' && type !== 'checklist' && type !== 'divider' && type !== 'image') {
      return [];
    }

    return [
      {
        id: typeof block.id === 'string' && block.id ? block.id : crypto.randomUUID(),
        type,
        text: typeof block.text === 'string' ? block.text : '',
        checked: type === 'checklist' ? block.checked === true : null,
        level:
          type === 'heading' && typeof block.level === 'number'
            ? Math.max(1, Math.min(3, Math.round(block.level)))
            : null
      }
    ];
  });
}

export function cloneBlocks(blocks: PlannerBlock[]): PlannerBlock[] {
  return blocks.map((block) => ({ ...block }));
}

export function toNoteBlockPayload(blocks: PlannerBlock[]) {
  return blocks.map((block, index) => ({
    id: block.id,
    type: block.type,
    text: block.type === 'divider' ? '' : block.text,
    checked: block.type === 'checklist' ? block.checked === true : null,
    level: block.type === 'heading' ? block.level ?? 2 : null,
    sort_order: index
  }));
}
