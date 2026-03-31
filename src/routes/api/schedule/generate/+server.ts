import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';
import type { Task } from '$lib/types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const {
    weekKey,
    weeklyTasks,
    monthlyTasks,
    randomTasks,
    lastWeekCompletion
  }: {
    weekKey: string;
    weeklyTasks: Task[];
    monthlyTasks: Task[];
    randomTasks: Task[];
    lastWeekCompletion?: number;
  } = body;

  if (!weekKey) throw error(400, 'weekKey is required');

  const taskLines = [
    ...weeklyTasks.map((t: Task) => `[Weekly] ${t.title}${t.completed ? ' ✓' : ''}`),
    ...monthlyTasks.map((t: Task) => `[Monthly] ${t.title}${t.completed ? ' ✓' : ''}`),
    ...randomTasks.map((t: Task) => `[Random] ${t.title}${t.completed ? ' ✓' : ''}`)
  ].join('\n');

  const completionNote =
    lastWeekCompletion !== undefined
      ? `\nLast week's completion rate: ${Math.round(lastWeekCompletion * 100)}%. Adjust difficulty accordingly.`
      : '';

  const prompt = `You are a personal productivity assistant. Create a weekly schedule for ${weekKey}.

Tasks to schedule:
${taskLines || '(No tasks — create a light general schedule)'}
${completionNote}

Return ONLY a JSON array. No markdown fences. No explanation. Each element must have exactly these fields:
{
  "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "task_title": "string",
  "notes": "string"
}

Rules:
- Use 24-hour time format (e.g., "09:00", "14:30")
- Distribute tasks realistically across Mon–Fri primarily
- Include short focus blocks (25–90 min each)
- Keep notes brief (one sentence max, or empty string)
- Return the raw JSON array only`;

  let responseText: string;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    responseText = content.text.trim();
  } catch (err) {
    throw error(502, `Claude API error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strip possible markdown fences
  responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let blocks: Array<{
    day: string;
    start_time: string;
    end_time: string;
    task_title: string;
    notes: string;
  }>;

  try {
    blocks = JSON.parse(responseText);
    if (!Array.isArray(blocks)) throw new Error('Response is not an array');
  } catch (parseErr) {
    throw error(500, `Failed to parse AI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
  }

  // Replace existing schedule for this week
  const { error: deleteError } = await supabaseAdmin
    .from('weekly_schedule')
    .delete()
    .eq('week_key', weekKey);

  if (deleteError) throw error(500, deleteError.message);

  const toInsert = blocks.map((b, i) => ({
    week_key: weekKey,
    day: b.day,
    start_time: b.start_time,
    end_time: b.end_time,
    task_title: b.task_title,
    notes: b.notes ?? '',
    sort_order: i
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('weekly_schedule')
    .insert(toInsert)
    .select();

  if (insertError) throw error(500, insertError.message);
  return json(data);
};
