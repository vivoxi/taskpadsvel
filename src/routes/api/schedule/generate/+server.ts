import { json, error } from '@sveltejs/kit';
import { generateScheduleText } from '$lib/server/ai';
import { generateRuleBasedSchedule } from '$lib/server/ruleScheduler';
import { materializeTasksForWeek } from '$lib/recurringTasks';
import { serializeScheduleBlockDetails } from '$lib/scheduleBlockDetails';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { getMonthKey, getPreviousMonthKey, getPreviousWeekKey, getWeekDays } from '$lib/weekUtils';
import type { RequestHandler } from './$types';
import type { HistorySnapshot, Task } from '$lib/types';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const WORK_WINDOWS = [
  { start: '10:00', end: '13:00' },
  { start: '14:00', end: '17:00' }
] as const;

type GeneratedBlock = {
  day: string;
  start_time: string;
  end_time: string;
  task_title: string;
  notes: string;
  linked_task_id?: string;
  linked_task_type?: Task['type'];
  linked_instance_key?: string;
};

function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed;
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error('No JSON array found in AI response');
  }

  return trimmed.slice(firstBracket, lastBracket + 1);
}

function validateBlocks(value: unknown): GeneratedBlock[] {
  if (!Array.isArray(value)) {
    throw new Error('Response is not an array');
  }

  const isWithinWorkingHours = (start: string, end: string) =>
    WORK_WINDOWS.some((window) => start >= window.start && end <= window.end && start < end);

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Block ${index + 1} is not an object`);
    }

    const candidate = item as Record<string, unknown>;
    const day = String(candidate.day ?? '');
    const start_time = String(candidate.start_time ?? '');
    const end_time = String(candidate.end_time ?? '');
    const task_title = String(candidate.task_title ?? '');
    const notes = typeof candidate.notes === 'string' ? candidate.notes : '';

    if (!DAY_NAMES.includes(day as (typeof DAY_NAMES)[number])) {
      throw new Error(`Block ${index + 1} has invalid day`);
    }

    if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
      throw new Error(`Block ${index + 1} has invalid time format`);
    }

    if (!isWithinWorkingHours(start_time, end_time)) {
      throw new Error(`Block ${index + 1} falls outside work hours 10:00-13:00 / 14:00-17:00`);
    }

    if (!task_title.trim()) {
      throw new Error(`Block ${index + 1} is missing task_title`);
    }

    return {
      day,
      start_time,
      end_time,
      task_title,
      notes
    };
  });
}

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const {
    weekKey,
    weekOfMonth,
    plannerNotes,
    weeklyTasks,
    monthlyTasks,
    lastWeekCompletion,
    mode
  }: {
    weekKey: string;
    weekOfMonth?: number;
    plannerNotes?: Record<string, string>;
    weeklyTasks: Task[];
    monthlyTasks: Task[];
    lastWeekCompletion?: number;
    mode?: 'ai' | 'rules';
  } = body;

  if (!weekKey) throw error(400, 'weekKey is required');

  const weekDays = getWeekDays(weekKey);
  const monthKey = getMonthKey(weekDays[2] ?? weekDays[0] ?? new Date());
  const previousWeekKey = getPreviousWeekKey(weekKey);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const { weeklyInstances, selectedMonthlyInstances, allInstances } = materializeTasksForWeek({
    weekKey,
    monthKey,
    weekOfMonth: weekOfMonth ?? 1,
    weeklyTasks,
    monthlyTasks
  });

  const describeTask = (
    label: string,
    task: (typeof allInstances)[number]
  ): string => {
    const normalizedTask = task;
    const estimatedHours = normalizedTask.estimated_hours ?? 1;
    const notes = normalizedTask.scheduling_notes.trim();

    return [
      `[${label}] ${normalizedTask.title}`,
      `hours=${estimatedHours}`,
      normalizedTask.completed ? 'completed=yes' : 'completed=no',
      normalizedTask.preferred_week_of_month
        ? `preferred_week=${normalizedTask.preferred_week_of_month}`
        : null,
      normalizedTask.preferred_day ? `preferred_day=${normalizedTask.preferred_day}` : null,
      notes ? `notes=${notes}` : null
    ]
      .filter(Boolean)
      .join(' | ');
  };

  const linkedTasks = [...weeklyTasks, ...monthlyTasks];
  const [previousWeeklySnapshotResult, previousMonthlySnapshotResult] = await Promise.all([
    supabaseAdmin
      .from('history_snapshots')
      .select('*')
      .eq('period_type', 'weekly')
      .eq('period_key', previousWeekKey)
      .maybeSingle(),
    supabaseAdmin
      .from('history_snapshots')
      .select('*')
      .eq('period_type', 'monthly')
      .eq('period_key', previousMonthKey)
      .maybeSingle()
  ]);

  const previousWeeklySnapshot = previousWeeklySnapshotResult.data as HistorySnapshot | null;
  const previousMonthlySnapshot = previousMonthlySnapshotResult.data as HistorySnapshot | null;
  const weeklyCarryoverTitles = (previousWeeklySnapshot?.missed_tasks ?? [])
    .map((task) => task.title)
    .filter((title): title is string => Boolean(title));
  const monthlyCarryoverTitles = (previousMonthlySnapshot?.missed_tasks ?? [])
    .map((task) => task.title)
    .filter((title): title is string => Boolean(title));
  const carryoverTaskTitles = Array.from(new Set([...weeklyCarryoverTitles, ...monthlyCarryoverTitles]));

  const taskLines = [
    ...weeklyInstances.map((t) => describeTask('Weekly', t)),
    ...selectedMonthlyInstances.map((t) => describeTask('Monthly', t))
  ].join('\n');

  const plannerLines = Object.entries(plannerNotes ?? {})
    .map(([day, content]) => `${day}: ${content}`)
    .join('\n');

  const completionNote =
    lastWeekCompletion !== undefined
      ? `\nLast week's completion rate: ${Math.round(lastWeekCompletion * 100)}%. Adjust difficulty accordingly.`
      : '';

  const prompt = `You are a personal productivity assistant. Create a weekly schedule for ${weekKey}.
This is week ${weekOfMonth ?? '?'} of the month.

Tasks to schedule:
${taskLines || '(No tasks — create a light general schedule)'}
${completionNote}

Carry-over priorities from previous periods:
${
    carryoverTaskTitles.length > 0
      ? carryoverTaskTitles.map((title) => `- ${title}`).join('\n')
      : '(No carry-over tasks)'
  }

Daily planner notes and constraints for this week:
${plannerLines || '(No planner notes provided)'}

Return ONLY a JSON array. No markdown fences. No explanation. Each element must have exactly these fields:
{
  "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "task_title": "string",
  "notes": "string"
}

Rules:
- Work hours are 10:00-17:00 with a mandatory break from 13:00-14:00
- Schedule blocks only inside these windows: 10:00-13:00 and 14:00-17:00
- Never place any task during 13:00-14:00
- Use 24-hour time format (e.g., "09:00", "14:30")
- Make the plan concrete and specific. Do not write generic labels like "Monthly work", "General control", or "Weekly tasks".
- task_title must be exactly one of the provided task titles. Do not paraphrase task names.
- Use the provided hours field as the approximate total effort needed for each task this week
- Split tasks into as many focus blocks as needed to cover their estimated hours realistically
- Prefer 30-120 minute blocks, but allow longer blocks when necessary
- Distribute tasks realistically across Mon–Fri primarily
- Use weekly tasks as recurring priorities that should be placed on specific days this week
- If a weekly task has preferred_day, place it on that day unless planner notes conflict
- Choose only the monthly tasks that should realistically be worked on in this specific week of the month
- If a monthly task has preferred_week, strongly prefer it only in that week of the month
- If a monthly task has preferred_day, place it on that day unless planner notes conflict
- If planner notes mention a task, day, time window, dependency, or sequence, follow those notes closely
- If planner notes include example time blocks, reuse those blocks instead of inventing vague placeholders
- If a task is listed in carry-over priorities, schedule it earlier in the week when possible
- Make sure every weekly task appears at least once in the schedule
- Do not schedule random tasks at all
- Keep notes brief (one sentence max, or empty string)
- Return the raw JSON array only`;

  let responseText: string;
  let blocks: GeneratedBlock[];

  if (mode === 'ai') {
    try {
      responseText = await generateScheduleText(prompt);
    } catch (err) {
      throw error(502, `${err instanceof Error ? err.message : String(err)}`);
    }

    responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      blocks = validateBlocks(JSON.parse(extractJsonArray(responseText)));
    } catch (parseErr) {
      throw error(500, `Failed to parse AI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
  } else {
    blocks = generateRuleBasedSchedule({
      weekKey,
      monthKey,
      weekOfMonth,
      plannerNotes,
      weeklyTasks,
      monthlyTasks,
      carryoverTaskTitles
    });
  }

  // Replace existing schedule for this week
  const { error: deleteError } = await supabaseAdmin
    .from('weekly_schedule')
    .delete()
    .eq('week_key', weekKey);

  if (deleteError) throw error(500, deleteError.message);

  const toInsert = blocks.map((b, i) => ({
    linkedTask: linkedTasks.find((task) => task.id === b.linked_task_id) ??
      linkedTasks.find(
        (task) => task.title === b.task_title && (!b.linked_task_type || task.type === b.linked_task_type)
      ),
    linked_instance_key: b.linked_instance_key ?? null,
    week_key: weekKey,
    day: b.day,
    start_time: b.start_time,
    end_time: b.end_time,
    task_title: b.task_title,
    notes: b.notes ?? '',
    sort_order: i
  })).map(({ linkedTask, ...block }) => ({
    ...block,
    notes: serializeScheduleBlockDetails(
      block.notes,
      false,
      linkedTask?.id ?? null,
      linkedTask?.type ?? null,
      block.linked_instance_key ?? null
    )
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('weekly_schedule')
    .insert(toInsert)
    .select();

  if (insertError) throw error(500, insertError.message);
  return json(data);
};
