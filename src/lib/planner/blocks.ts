import type { BlockType, PlannerBlock } from '$lib/planner/types';

const SUPPORTED_BLOCK_TYPES = new Set<BlockType>([
  'heading',
  'heading1',
  'heading2',
  'heading3',
  'paragraph',
  'checklist',
  'todo',
  'bullet_list',
  'numbered_list',
  'code',
  'quote',
  'divider',
  'image',
  'file'
]);

function headingLevel(type: BlockType): number | null {
  if (type === 'heading1') return 1;
  if (type === 'heading2' || type === 'heading') return 2;
  if (type === 'heading3') return 3;
  return null;
}

export function createBlock(type: BlockType): PlannerBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: '',
    checked: type === 'checklist' || type === 'todo' ? false : null,
    level: headingLevel(type)
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
    if (typeof type !== 'string' || !SUPPORTED_BLOCK_TYPES.has(type as BlockType)) {
      return [];
    }

    const normalizedType = type as BlockType;

    return [
      {
        id: typeof block.id === 'string' && block.id ? block.id : crypto.randomUUID(),
        type: normalizedType,
        text: typeof block.text === 'string' ? block.text : '',
        checked: normalizedType === 'checklist' || normalizedType === 'todo' ? block.checked === true : null,
        level:
          (normalizedType === 'heading' ||
            normalizedType === 'heading1' ||
            normalizedType === 'heading2' ||
            normalizedType === 'heading3') &&
          typeof block.level === 'number'
            ? Math.max(1, Math.min(3, Math.round(block.level)))
            : headingLevel(normalizedType)
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
    checked: block.type === 'checklist' || block.type === 'todo' ? block.checked === true : null,
    level: block.type === 'heading' ? block.level ?? 2 : headingLevel(block.type),
    sort_order: index
  }));
}
