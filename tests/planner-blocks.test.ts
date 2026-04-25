import { describe, expect, it } from 'vitest';
import { createBlock, normalizeBlocks, toNoteBlockPayload } from '../src/lib/planner/blocks';
import type { BlockType } from '../src/lib/planner/types';

const supportedNoteBlockTypes: BlockType[] = [
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
];

describe('planner blocks', () => {
  it('creates checklist blocks with unchecked state', () => {
    const block = createBlock('checklist');

    expect(block.type).toBe('checklist');
    expect(block.checked).toBe(false);
    expect(block.text).toBe('');
  });

  it('creates divider blocks without checklist state', () => {
    const block = createBlock('divider');

    expect(block.type).toBe('divider');
    expect(block.checked).toBeNull();
    expect(block.level).toBeNull();
  });

  it('normalizes mixed input into valid planner blocks', () => {
    const blocks = normalizeBlocks([
      { id: 'a', type: 'heading', text: 'Title', level: 2 },
      { id: 'b', type: 'paragraph', text: 'Body' },
      { id: 'c', type: 'checklist', text: 'Tick', checked: true },
      { id: 'd', type: 'divider', text: 'Ignored text' },
      { type: 'unknown', text: 'Ignored' }
    ]);

    expect(blocks).toHaveLength(4);
    expect(blocks[0]?.type).toBe('heading');
    expect(blocks[2]?.checked).toBe(true);
    expect(blocks[3]?.type).toBe('divider');
  });

  it('clamps heading levels and drops invalid entries', () => {
    const blocks = normalizeBlocks([
      { id: 'h', type: 'heading', text: 'Too deep', level: 9 },
      { id: 'p', type: 'paragraph', text: 42 },
      null,
      ['not', 'a', 'block']
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.level).toBe(3);
    expect(blocks[1]?.text).toBe('');
  });

  it('normalizes every note block type accepted by the database constraint', () => {
    const blocks = normalizeBlocks(
      supportedNoteBlockTypes.map((type) => ({
        id: `block-${type}`,
        type,
        text: `${type} text`,
        checked: true,
        level: 9
      }))
    );

    expect(blocks.map((block) => block.type)).toEqual(supportedNoteBlockTypes);
    expect(blocks.find((block) => block.type === 'heading1')?.level).toBe(1);
    expect(blocks.find((block) => block.type === 'heading2')?.level).toBe(2);
    expect(blocks.find((block) => block.type === 'heading3')?.level).toBe(3);
    expect(blocks.find((block) => block.type === 'todo')?.checked).toBe(true);
    expect(blocks.find((block) => block.type === 'bullet_list')?.checked).toBeNull();
  });

  it('generates database payloads with stable sort order and type-specific fields', () => {
    const blocks = normalizeBlocks([
      { id: 'h1', type: 'heading1', text: 'Heading', level: 1 },
      { id: 'todo', type: 'todo', text: 'Done', checked: true },
      { id: 'divider', type: 'divider', text: 'ignored' },
      { id: 'image', type: 'image', text: 'https://example.com/image.png' },
      { id: 'code', type: 'code', text: 'const x = 1;' }
    ]);

    expect(toNoteBlockPayload(blocks)).toEqual([
      {
        id: 'h1',
        type: 'heading1',
        text: 'Heading',
        checked: null,
        level: 1,
        sort_order: 0
      },
      {
        id: 'todo',
        type: 'todo',
        text: 'Done',
        checked: true,
        level: null,
        sort_order: 1
      },
      {
        id: 'divider',
        type: 'divider',
        text: '',
        checked: null,
        level: null,
        sort_order: 2
      },
      {
        id: 'image',
        type: 'image',
        text: 'https://example.com/image.png',
        checked: null,
        level: null,
        sort_order: 3
      },
      {
        id: 'code',
        type: 'code',
        text: 'const x = 1;',
        checked: null,
        level: null,
        sort_order: 4
      }
    ]);
  });
});
