import { describe, expect, it } from 'vitest';
import { createBlock, normalizeBlocks } from '../src/lib/planner/blocks';

describe('planner blocks', () => {
  it('creates checklist blocks with unchecked state', () => {
    const block = createBlock('checklist');

    expect(block.type).toBe('checklist');
    expect(block.checked).toBe(false);
    expect(block.text).toBe('');
  });

  it('normalizes mixed input into valid planner blocks', () => {
    const blocks = normalizeBlocks([
      { id: 'a', type: 'heading', text: 'Title', level: 2 },
      { id: 'b', type: 'paragraph', text: 'Body' },
      { id: 'c', type: 'checklist', text: 'Tick', checked: true },
      { type: 'unknown', text: 'Ignored' }
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.type).toBe('heading');
    expect(blocks[2]?.checked).toBe(true);
  });
});
