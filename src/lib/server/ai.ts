import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

export type SupportedAiProvider = 'anthropic' | 'openai-compatible';

function getAiProvider(): SupportedAiProvider {
  const provider = env.AI_PROVIDER?.trim().toLowerCase();
  if (provider === 'openai' || provider === 'openai-compatible') {
    return 'openai-compatible';
  }
  return 'anthropic';
}

function getTextFromAnthropicResponse(message: Anthropic.Messages.Message): string {
  const content = message.content[0];
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected Anthropic response type');
  }
  return content.text.trim();
}

async function generateWithAnthropic(prompt: string): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  const model = env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  });

  return getTextFromAnthropicResponse(message);
}

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

function extractOpenAiCompatibleText(payload: OpenAiCompatibleResponse): string {
  const messageContent = payload.choices?.[0]?.message?.content;

  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    const text = messageContent
      .map((part) => (part?.type === 'text' || !part?.type ? part?.text ?? '' : ''))
      .join('')
      .trim();

    if (text) return text;
  }

  throw new Error('Unexpected OpenAI-compatible response type');
}

async function generateWithOpenAiCompatible(prompt: string): Promise<string> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const model = env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const apiUrl = env.OPENAI_API_URL?.trim() || 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const payload = (await response.json().catch(() => null)) as OpenAiCompatibleResponse | null;

  if (!response.ok) {
    const message = payload?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`OpenAI-compatible API error: ${message}`);
  }

  if (!payload) {
    throw new Error('OpenAI-compatible API returned an empty response');
  }

  return extractOpenAiCompatibleText(payload);
}

export async function generateScheduleText(prompt: string): Promise<string> {
  const provider = getAiProvider();

  if (provider === 'openai-compatible') {
    return generateWithOpenAiCompatible(prompt);
  }

  return generateWithAnthropic(prompt);
}
