import { describe, expect, it } from 'vitest';
import { createBlock, normalizeBlocks } from '../src/lib/planner/blocks';

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
});
