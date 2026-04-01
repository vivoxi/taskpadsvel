import { describe, expect, it } from 'vitest';

describe('AI provider config', () => {
  it('documents supported providers in env example', async () => {
    const fs = await import('node:fs/promises');
    const envExample = await fs.readFile(new URL('../.env.example', import.meta.url), 'utf8');

    expect(envExample).toContain('AI_PROVIDER=anthropic');
    expect(envExample).toContain('OPENAI_API_KEY=');
    expect(envExample).toContain('OPENAI_API_URL=https://api.openai.com/v1/chat/completions');
  });
});
