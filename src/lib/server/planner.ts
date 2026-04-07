import { error } from '@sveltejs/kit';
import { cloneBlocks, createBlock, normalizeBlocks, toNoteBlockPayload } from '$lib/planner/blocks';
import {
  DAY_NAMES,
  type DayName,
  type MonthViewData,
  type NotesDocument,
  type NotesViewData,
  type PlannerBlock,
  type TaskInstance,
  type TaskTemplate,
  type WeekViewData
} from '$lib/planner/types';
import {
  canAutoMaterializeMonthKey,
  formatDayDate,
  getBoardMonthKeyForWeek,
  getBoardWeeksForMonth,
  getMonthKey,
  getTodayDayName,
  getWeekIndexForMonth,
  getWeekKey,
  monthLabel,
  normalizeMonthKey,
  normalizeWeekKey,
  toIsoDate,
  weekLabel
} from '$lib/planner/dates';
import { supabaseAdmin } from '$lib/server/supabase';

function sortTemplates(templates: TaskTemplate[]): TaskTemplate[] {
  return [...templates].sort((left, right) => {
    return (
      (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.title.localeCompare(right.title)
    );
  });
}

function sortInstances(instances: TaskInstance[]): TaskInstance[] {
  return [...instances].sort((left, right) => {
    const leftDayIndex = left.day_name ? DAY_NAMES.indexOf(left.day_name) : Number.MAX_SAFE_INTEGER;
    const rightDayIndex = right.day_name ? DAY_NAMES.indexOf(right.day_name) : Number.MAX_SAFE_INTEGER;

    return (
      (left.week_of_month ?? Number.MAX_SAFE_INTEGER) - (right.week_of_month ?? Number.MAX_SAFE_INTEGER) ||
      leftDayIndex - rightDayIndex ||
      (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  });
}

async function listTemplates(): Promise<TaskTemplate[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('task_templates')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (queryError) {
    throw error(500, queryError.message);
  }

  return sortTemplates((data ?? []) as TaskTemplate[]);
}

async function listInstances(monthKey: string): Promise<TaskInstance[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('task_instances')
    .select('*')
    .eq('month_key', monthKey)
    .order('week_of_month', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (queryError) {
    throw error(500, queryError.message);
  }

  console.log('[listInstances]', monthKey, (data ?? []).map((i: Record<string, unknown>) => ({ id: i.id, day_name: i.day_name })));

  return sortInstances((data ?? []) as TaskInstance[]);
}

function getDefaultMonthlyWeekKey(
  template: TaskTemplate,
  monthKey: string
): { weekKey: string | null; weekIndex: number | null } {
  const weeks = getBoardWeeksForMonth(monthKey);
  const preferred = template.preferred_week_of_month
    ? weeks.find((entry) => entry.index === template.preferred_week_of_month)
    : null;

  return {
    weekKey: preferred?.weekKey ?? null,
    weekIndex: preferred?.index ?? null
  };
}

export async function ensureMonthPlanInstances(inputMonthKey: string): Promise<{
  monthKey: string;
  templates: TaskTemplate[];
  instances: TaskInstance[];
}> {
  const monthKey = normalizeMonthKey(inputMonthKey);
  const [templates, existingInstances] = await Promise.all([listTemplates(), listInstances(monthKey)]);

  // Prevent bots or malformed URLs from materializing arbitrary centuries of months through GET requests.
  if (!canAutoMaterializeMonthKey(monthKey)) {
    return {
      monthKey,
      templates,
      instances: existingInstances
    };
  }

  const weeks = getBoardWeeksForMonth(monthKey);
  const missingRows: Omit<TaskInstance, 'created_at' | 'updated_at'>[] = [];

  const activeWeeklyTemplates = templates.filter((template) => template.active && template.kind === 'weekly');
  const activeMonthlyTemplates = templates.filter((template) => template.active && template.kind === 'monthly');

  for (const template of activeWeeklyTemplates) {
    for (const week of weeks) {
      const existing = existingInstances.find(
        (instance) =>
          instance.instance_kind === 'weekly' &&
          instance.template_id === template.id &&
          instance.month_key === monthKey &&
          instance.week_key === week.weekKey
      );

      if (existing) continue;

      missingRows.push({
        id: crypto.randomUUID(),
        template_id: template.id,
        title_snapshot: template.title,
        instance_kind: 'weekly',
        week_key: week.weekKey,
        month_key: monthKey,
        week_of_month: week.index,
        day_name: template.preferred_day,
        status: 'open',
        completed_at: null,
        sort_order: template.sort_order ?? null,
        source_context: {
          month_key: monthKey,
          created_from: 'template-default'
        }
      });
    }
  }

  for (const template of activeMonthlyTemplates) {
    const existing = existingInstances.find(
      (instance) =>
        instance.instance_kind === 'monthly' &&
        instance.template_id === template.id &&
        instance.month_key === monthKey
    );

    if (existing) continue;

    const defaultPlacement = getDefaultMonthlyWeekKey(template, monthKey);

    missingRows.push({
      id: crypto.randomUUID(),
      template_id: template.id,
      title_snapshot: template.title,
      instance_kind: 'monthly',
      week_key: defaultPlacement.weekKey,
      month_key: monthKey,
      week_of_month: defaultPlacement.weekIndex,
      day_name: template.preferred_day,
      status: 'open',
      completed_at: null,
      sort_order: template.sort_order ?? null,
      source_context: {
        month_key: monthKey,
        created_from: 'template-default'
      }
    });
  }

  if (missingRows.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('task_instances').insert(missingRows);
    if (insertError) {
      throw error(500, insertError.message);
    }
  }

  return {
    monthKey,
    templates,
    instances: missingRows.length > 0 ? await listInstances(monthKey) : existingInstances
  };
}

export async function getWeekViewData(inputWeekKey: string): Promise<WeekViewData> {
  const weekKey = normalizeWeekKey(inputWeekKey);
  const monthKey = getBoardMonthKeyForWeek(weekKey);
  await ensureMonthPlanInstances(monthKey);

  const [{ data: taskRows, error: taskError }, { data: noteRows, error: notesError }] = await Promise.all([
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .eq('week_key', weekKey)
      .order('status', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('weekly_notes').select('*').eq('week_key', weekKey)
  ]);

  if (taskError) throw error(500, taskError.message);
  if (notesError) throw error(500, notesError.message);

  const notesByDay = new Map<string, PlannerBlock[]>();
  for (const row of noteRows ?? []) {
    notesByDay.set(row.day_name, normalizeBlocks(row.blocks_json));
  }

  return {
    weekKey,
    monthKey,
    label: weekLabel(weekKey),
    isCurrentWeek: weekKey === getWeekKey(),
    todayDayName: getTodayDayName(weekKey),
    days: DAY_NAMES.map((dayName) => ({
      dayName,
      dateLabel: formatDayDate(weekKey, dayName),
      isoDate: toIsoDate(weekKey, dayName),
      blocks: cloneBlocks(notesByDay.get(dayName) ?? [])
    })),
    tasks: sortInstances((taskRows ?? []) as TaskInstance[])
  };
}

export async function getMonthViewData(inputMonthKey: string): Promise<MonthViewData> {
  const { monthKey, templates, instances } = await ensureMonthPlanInstances(inputMonthKey);

  return {
    monthKey,
    label: monthLabel(monthKey),
    weeks: getBoardWeeksForMonth(monthKey),
    templates,
    instances
  };
}

export async function getNotesViewData(selectedDocumentId: string | null | undefined): Promise<NotesViewData> {
  const { data: initialDocuments, error: docsError } = await supabaseAdmin
    .from('notes_documents')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (docsError) {
    throw error(500, docsError.message);
  }

  let documents = (initialDocuments ?? []) as NotesDocument[];

  if (documents.length === 0) {
    const now = new Date().toISOString();
    const seedDocument = {
      id: crypto.randomUUID(),
      title: 'Workspace',
      slug: 'workspace',
      created_at: now,
      updated_at: now
    };

    const { error: insertError } = await supabaseAdmin.from('notes_documents').insert(seedDocument);
    if (insertError) {
      throw error(500, insertError.message);
    }

    const { error: blockError } = await supabaseAdmin.from('note_blocks').insert([
      {
        id: crypto.randomUUID(),
        document_id: seedDocument.id,
        type: 'heading',
        text: 'Workspace',
        checked: null,
        level: 1,
        sort_order: 0
      },
      {
        id: crypto.randomUUID(),
        document_id: seedDocument.id,
        type: 'paragraph',
        text: 'Use this space for longer notes, reference material, and thinking that should not compete with the weekly workspace.',
        checked: null,
        level: null,
        sort_order: 1
      }
    ]);

    if (blockError) {
      throw error(500, blockError.message);
    }

    documents = [seedDocument];
  }

  const selectedId =
    documents.find((document) => document.id === selectedDocumentId)?.id ?? documents[0]?.id;

  if (!selectedId) {
    throw error(500, 'Unable to select a note document');
  }

  const { data: blockRows, error: blockQueryError } = await supabaseAdmin
    .from('note_blocks')
    .select('*')
    .eq('document_id', selectedId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (blockQueryError) {
    throw error(500, blockQueryError.message);
  }

  return {
    selectedDocumentId: selectedId,
    documents,
    blocks: normalizeBlocks(blockRows)
  };
}

export async function saveWeeklyDayBlocks(
  weekKey: string,
  dayName: DayName,
  blocks: PlannerBlock[]
): Promise<void> {
  const normalizedWeekKey = normalizeWeekKey(weekKey);
  const normalizedBlocks = cloneBlocks(normalizeBlocks(blocks));

  const { error: upsertError } = await supabaseAdmin.from('weekly_notes').upsert(
    {
      week_key: normalizedWeekKey,
      day_name: dayName,
      blocks_json: normalizedBlocks,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: 'week_key,day_name',
      ignoreDuplicates: false
    }
  );

  if (upsertError) {
    throw error(500, upsertError.message);
  }
}

export async function saveNoteBlocks(documentId: string, blocks: PlannerBlock[]): Promise<void> {
  const normalizedBlocks = toNoteBlockPayload(normalizeBlocks(blocks));

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('note_blocks')
    .select('id')
    .eq('document_id', documentId);

  if (existingError) {
    throw error(500, existingError.message);
  }

  const existingIds = new Set((existingRows ?? []).map((entry) => entry.id));
  const nextIds = new Set(normalizedBlocks.map((entry) => entry.id));
  const idsToDelete = [...existingIds].filter((id) => !nextIds.has(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('note_blocks')
      .delete()
      .eq('document_id', documentId)
      .in('id', idsToDelete);

    if (deleteError) {
      throw error(500, deleteError.message);
    }
  }

  if (normalizedBlocks.length > 0) {
    const { error: upsertError } = await supabaseAdmin.from('note_blocks').upsert(
      normalizedBlocks.map((block) => ({
        ...block,
        document_id: documentId
      })),
      {
        onConflict: 'id'
      }
    );

    if (upsertError) {
      throw error(500, upsertError.message);
    }
  }

  const { error: docUpdateError } = await supabaseAdmin
    .from('notes_documents')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', documentId);

  if (docUpdateError) {
    throw error(500, docUpdateError.message);
  }
}

export function createStarterBlocks(): PlannerBlock[] {
  return [createBlock('paragraph')];
}

export async function syncTemplateSnapshot(templateId: string, title: string): Promise<void> {
  const { error: updateError } = await supabaseAdmin
    .from('task_instances')
    .update({ title_snapshot: title })
    .eq('template_id', templateId);

  if (updateError) {
    throw error(500, updateError.message);
  }
}

export function inferWeekIndex(weekKey: string | null, monthKey: string | null): number | null {
  if (!weekKey || !monthKey) return null;
  return getWeekIndexForMonth(weekKey, monthKey);
}
