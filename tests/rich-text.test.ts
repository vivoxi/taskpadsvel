import { describe, expect, it } from 'vitest';
import { sanitizeRichTextHtml, toRichTextHtml } from '../src/lib/planner/rich-text';

describe('rich text helpers', () => {
  it('converts legacy markdown into allowed HTML', () => {
    const html = toRichTextHtml('A **bold** and [link](https://example.com)');

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
  });

  it('escapes unsafe tags from stored HTML', () => {
    const html = sanitizeRichTextHtml('<strong>ok</strong><img src=x onerror=alert(1)>');

    expect(html).toContain('<strong>ok</strong>');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('keeps only http links active', () => {
    const html = sanitizeRichTextHtml('<a href="javascript:alert(1)">bad</a>');

    expect(html).toContain('&lt;a');
    expect(html).not.toContain('href="javascript:');
  });
});
