import { error } from '@sveltejs/kit';
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO
} from 'date-fns';
import { cloneBlocks, createBlock, normalizeBlocks, toNoteBlockPayload } from '$lib/planner/blocks';
import {
  DAY_NAMES,
  type CapacitySnapshot,
  type DayName,
  type HistoryViewData,
  type InboxItem,
  type MonthViewData,
  type NotesDocument,
  type NotesViewData,
  type PlannerBlock,
  type PlannerSettings,
  type ScheduleBlock,
  type ScheduleHealth,
  type SearchResults,
  type TaskAttachment,
  type TaskInstance,
  type TaskPriority,
  type TaskSourceType,
  type TaskTemplate,
  type WeekViewData
} from '$lib/planner/types';
import {
  canAutoMaterializeMonthKey,
  formatDayDate,
  getBoardMonthKeyForWeek,
  getBoardWeeksForMonth,
  getTodayDayName,
  getWeekDays,
  getWeekIndexForMonth,
  getWeekKey,
  getWorkingDaysInMonth,
  getWorkingDaysInWeek,
  getWorkingHoursPerDay,
  monthLabel,
  normalizeMonthKey,
  normalizeWeekKey,
  parseMonthKey,
  toIsoDate,
  weekLabel
} from '$lib/planner/dates';
import { supabaseAdmin } from '$lib/server/supabase';

const SETTINGS_DEFAULTS: Omit<PlannerSettings, 'id' | 'created_at' | 'updated_at'> = {
  label: 'Primary schedule',
  working_day_start: '10:00',
  working_day_end: '17:00',
  break_start: '13:00',
  break_end: '14:00',
  buffer_minutes: 0,
  theme_mode: 'system'
};

function priorityWeight(priority: TaskPriority): number {
  return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
}

function getTaskHours(task: Pick<TaskInstance, 'hours_needed'> | Pick<TaskTemplate, 'hours_needed_default' | 'estimate_hours'>): number {
  if ('hours_needed' in task) {
    return Math.max(0.5, Number(task.hours_needed ?? 1));
  }

  return Math.max(0.5, Number(task.hours_needed_default ?? task.estimate_hours ?? 1));
}

function normalizeTemplate(row: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: row.id ?? crypto.randomUUID(),
    title: row.title ?? 'Untitled template',
    kind: row.kind === 'monthly' ? 'monthly' : 'weekly',
    active: row.active ?? true,
    estimate_hours: row.estimate_hours ?? null,
    hours_needed_default: row.hours_needed_default ?? row.estimate_hours ?? null,
    priority_default: row.priority_default === 'high' || row.priority_default === 'low' ? row.priority_default : 'medium',
    category: row.category ?? null,
    source_type_default: row.source_type_default === 'monthly' || row.source_type_default === 'inbox' ? row.source_type_default : 'weekly',
    due_day_offset: row.due_day_offset ?? null,
    preferred_day: DAY_NAMES.includes(row.preferred_day as DayName) ? (row.preferred_day as DayName) : null,
    preferred_week_of_month: row.preferred_week_of_month ?? null,
    sort_order: row.sort_order ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function normalizeTask(row: Partial<TaskInstance>): TaskInstance {
  return {
    id: row.id ?? crypto.randomUUID(),
    template_id: row.template_id ?? null,
    title_snapshot: row.title_snapshot ?? 'Untitled task',
    instance_kind: row.instance_kind === 'monthly' ? 'monthly' : 'weekly',
    week_key: row.week_key ?? null,
    month_key: row.month_key ?? null,
    week_of_month: row.week_of_month ?? null,
    day_name: DAY_NAMES.includes(row.day_name as DayName) ? (row.day_name as DayName) : null,
    status: row.status === 'done' ? 'done' : 'open',
    completed_at: row.completed_at ?? null,
    priority: row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    due_date: row.due_date ?? null,
    hours_needed: row.hours_needed ?? null,
    category: row.category ?? null,
    source_type:
      row.source_type === 'monthly' || row.source_type === 'inbox' ? row.source_type : 'weekly',
    preferred_day: DAY_NAMES.includes(row.preferred_day as DayName) ? (row.preferred_day as DayName) : null,
    preferred_week: row.preferred_week ?? null,
    carried_from_instance_id: row.carried_from_instance_id ?? null,
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    linked_schedule_block_id: row.linked_schedule_block_id ?? null,
    sort_order: row.sort_order ?? null,
    source_context: row.source_context ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function normalizeInboxItem(row: Partial<InboxItem>): InboxItem {
  return {
    id: row.id ?? crypto.randomUUID(),
    title: row.title ?? 'Untitled inbox item',
    notes: row.notes ?? null,
    priority: row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    due_date: row.due_date ?? null,
    hours_needed: row.hours_needed ?? null,
    category: row.category ?? null,
    preferred_day: DAY_NAMES.includes(row.preferred_day as DayName) ? (row.preferred_day as DayName) : null,
    preferred_week: row.preferred_week ?? null,
    source_type: 'inbox',
    promoted_to_instance_id: row.promoted_to_instance_id ?? null,
    promoted_to_template_id: row.promoted_to_template_id ?? null,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function normalizeSettings(row: Partial<PlannerSettings>): PlannerSettings {
  return {
    id: row.id ?? crypto.randomUUID(),
    ...SETTINGS_DEFAULTS,
    ...row,
    theme_mode:
      row.theme_mode === 'light' || row.theme_mode === 'dark' ? row.theme_mode : 'system',
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function normalizeScheduleBlock(row: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: row.id ?? crypto.randomUUID(),
    task_instance_id: row.task_instance_id ?? null,
    week_key: row.week_key ?? null,
    month_key: row.month_key ?? null,
    day_name: DAY_NAMES.includes(row.day_name as DayName) ? (row.day_name as DayName) : null,
    scheduled_for: row.scheduled_for ?? new Date().toISOString().slice(0, 10),
    starts_at: row.starts_at ?? '10:00:00',
    ends_at: row.ends_at ?? '11:00:00',
    duration_hours: Number(row.duration_hours ?? 1),
    locked: row.locked ?? false,
    status: row.status === 'done' || row.status === 'skipped' ? row.status : 'planned',
    source_type:
      row.source_type === 'monthly' || row.source_type === 'inbox' ? row.source_type : 'weekly',
    title_snapshot: row.title_snapshot ?? 'Planned block',
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function normalizeAttachment(row: Partial<TaskAttachment>): TaskAttachment {
  return {
    id: row.id ?? crypto.randomUUID(),
    task_instance_id: row.task_instance_id ?? null,
    note_document_id: row.note_document_id ?? null,
    file_name: row.file_name ?? 'attachment',
    file_path: row.file_path ?? '',
    mime_type: row.mime_type ?? null,
    created_at: row.created_at ?? new Date().toISOString()
  };
}

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
    const leftDue = left.due_date ? left.due_date : '9999-12-31';
    const rightDue = right.due_date ? right.due_date : '9999-12-31';

    return (
      Number(left.archived_at !== null) - Number(right.archived_at !== null) ||
      priorityWeight(left.priority) - priorityWeight(right.priority) ||
      leftDue.localeCompare(rightDue) ||
      (left.week_of_month ?? Number.MAX_SAFE_INTEGER) - (right.week_of_month ?? Number.MAX_SAFE_INTEGER) ||
      leftDayIndex - rightDayIndex ||
      (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  });
}

async function ensurePlannerSettings(): Promise<PlannerSettings> {
  const { data, error: queryError } = await supabaseAdmin
    .from('planner_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queryError) {
    throw error(500, queryError.message);
  }

  if (data) {
    return normalizeSettings(data as PlannerSettings);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('planner_settings')
    .insert(SETTINGS_DEFAULTS)
    .select('*')
    .single();

  if (insertError) {
    throw error(500, insertError.message);
  }

  return normalizeSettings(inserted as PlannerSettings);
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

  return sortTemplates((data ?? []).map((row) => normalizeTemplate(row as TaskTemplate)));
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

  return sortInstances((data ?? []).map((row) => normalizeTask(row as TaskInstance)));
}

async function listInboxItems(limit = 12): Promise<InboxItem[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('inbox_items')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (queryError) {
    throw error(500, queryError.message);
  }

  return (data ?? []).map((row) => normalizeInboxItem(row as InboxItem));
}

async function listScheduleBlocksForMonth(monthKey: string): Promise<ScheduleBlock[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('schedule_blocks')
    .select('*')
    .eq('month_key', monthKey)
    .order('scheduled_for', { ascending: true })
    .order('starts_at', { ascending: true });

  if (queryError) {
    throw error(500, queryError.message);
  }

  return (data ?? []).map((row) => normalizeScheduleBlock(row as ScheduleBlock));
}

function clampDateToMonth(monthKey: string, offset: number): string {
  const start = parseMonthKey(monthKey);
  const candidate = addDays(start, offset);
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  if (candidate > lastDay) return format(lastDay, 'yyyy-MM-dd');
  if (candidate < start) return format(start, 'yyyy-MM-dd');
  return format(candidate, 'yyyy-MM-dd');
}

function getDueDateForTemplate(template: TaskTemplate, monthKey: string, weekKey: string | null): string | null {
  if (template.due_day_offset === null) return null;

  if (template.kind === 'weekly' && weekKey) {
    const days = getWeekDays(weekKey);
    const target = days[Math.max(0, Math.min(6, template.due_day_offset))] ?? days[0];
    return format(target, 'yyyy-MM-dd');
  }

  return clampDateToMonth(monthKey, template.due_day_offset);
}

function buildCapacitySnapshot(
  tasks: TaskInstance[],
  settings: PlannerSettings,
  scope: { monthKey?: string; weekKey?: string }
): CapacitySnapshot {
  const activeTasks = tasks.filter((task) => task.archived_at === null);
  const availableHours =
    scope.monthKey
      ? getWorkingDaysInMonth(scope.monthKey).length * getWorkingHoursPerDay(settings)
      : getWorkingDaysInWeek(scope.weekKey ?? getWeekKey()).length * getWorkingHoursPerDay(settings);
  const plannedHours = activeTasks.reduce((sum, task) => sum + getTaskHours(task), 0);
  const overdueCount = activeTasks.filter((task) => task.status === 'open' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)).length;
  const dueSoonCount = activeTasks.filter((task) => {
    if (task.status !== 'open' || !task.due_date) return false;
    return differenceInCalendarDays(parseISO(task.due_date), new Date()) <= 3;
  }).length;
  const unassignedHours = activeTasks
    .filter((task) => task.status === 'open' && task.day_name === null)
    .reduce((sum, task) => sum + getTaskHours(task), 0);

  return {
    available_hours: Number(availableHours.toFixed(1)),
    planned_hours: Number(plannedHours.toFixed(1)),
    remaining_hours: Number(Math.max(availableHours - plannedHours, 0).toFixed(1)),
    overflow_hours: Number(Math.max(plannedHours - availableHours, 0).toFixed(1)),
    due_soon_count: dueSoonCount,
    overdue_count: overdueCount,
    unassigned_hours: Number(unassignedHours.toFixed(1))
  };
}

function buildScheduleHealth(tasks: TaskInstance[], blocks: ScheduleBlock[], capacity: CapacitySnapshot): ScheduleHealth {
  const splitCandidateCount = tasks.filter((task) => getTaskHours(task) > 2).length;
  const overflowWarning =
    capacity.overflow_hours > 0
      ? `${capacity.overflow_hours.toFixed(1)}h over capacity`
      : null;
  const duePressureWarning =
    capacity.overdue_count > 0
      ? `${capacity.overdue_count} overdue task${capacity.overdue_count === 1 ? '' : 's'} need attention`
      : capacity.due_soon_count > 0
        ? `${capacity.due_soon_count} task${capacity.due_soon_count === 1 ? '' : 's'} due soon`
        : null;

  return {
    block_count: blocks.length,
    locked_count: blocks.filter((block) => block.locked).length,
    split_candidate_count: splitCandidateCount,
    overflow_warning: overflowWarning,
    due_pressure_warning: duePressureWarning
  };
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
        priority: template.priority_default,
        due_date: getDueDateForTemplate(template, monthKey, week.weekKey),
        hours_needed: template.hours_needed_default ?? template.estimate_hours,
        category: template.category,
        source_type: template.source_type_default === 'monthly' ? 'weekly' : template.source_type_default,
        preferred_day: template.preferred_day,
        preferred_week: week.index,
        carried_from_instance_id: null,
        archived_at: null,
        archive_reason: null,
        linked_schedule_block_id: null,
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
      priority: template.priority_default,
      due_date: getDueDateForTemplate(template, monthKey, null),
      hours_needed: template.hours_needed_default ?? template.estimate_hours,
      category: template.category,
      source_type: template.source_type_default,
      preferred_day: template.preferred_day,
      preferred_week: defaultPlacement.weekIndex,
      carried_from_instance_id: null,
      archived_at: null,
      archive_reason: null,
      linked_schedule_block_id: null,
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
  const [settings, inboxItems] = await Promise.all([ensurePlannerSettings(), listInboxItems(8)]);
  await ensureMonthPlanInstances(monthKey);

  const [{ data: taskRows, error: taskError }, { data: noteRows, error: notesError }, blocks] =
    await Promise.all([
      supabaseAdmin
        .from('task_instances')
        .select('*')
        .eq('week_key', weekKey)
        .is('archived_at', null)
        .order('status', { ascending: true })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('weekly_notes').select('*').eq('week_key', weekKey),
      listScheduleBlocksForMonth(monthKey)
    ]);

  if (taskError) throw error(500, taskError.message);
  if (notesError) throw error(500, notesError.message);

  const tasks = sortInstances((taskRows ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const notesByDay = new Map<string, PlannerBlock[]>();
  for (const row of noteRows ?? []) {
    notesByDay.set(row.day_name, normalizeBlocks(row.blocks_json));
  }

  const weekBlocks = blocks.filter((block) => block.week_key === weekKey);
  const capacity = buildCapacitySnapshot(tasks, settings, { weekKey });

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
    tasks,
    inboxItems,
    settings,
    capacity,
    schedule: buildScheduleHealth(tasks, weekBlocks, capacity)
  };
}

export async function getMonthViewData(inputMonthKey: string): Promise<MonthViewData> {
  const { monthKey, templates, instances } = await ensureMonthPlanInstances(inputMonthKey);
  const activeInstances = instances.filter((task) => task.archived_at === null);
  const [settings, inboxItems, blocks] = await Promise.all([
    ensurePlannerSettings(),
    listInboxItems(12),
    listScheduleBlocksForMonth(monthKey)
  ]);
  const capacity = buildCapacitySnapshot(activeInstances, settings, {
    monthKey
  });

  return {
    monthKey,
    label: monthLabel(monthKey),
    weeks: getBoardWeeksForMonth(monthKey),
    templates,
    instances: activeInstances,
    inboxItems,
    settings,
    capacity,
    schedule: buildScheduleHealth(activeInstances, blocks, capacity)
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
        text: 'Use this space for reference material, context, and thought work that should not drive planning logic.',
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

  const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
    .from('task_attachments')
    .select('*')
    .eq('note_document_id', selectedId)
    .order('created_at', { ascending: false });

  if (attachmentError) {
    throw error(500, attachmentError.message);
  }

  return {
    selectedDocumentId: selectedId,
    documents,
    blocks: normalizeBlocks(blockRows),
    attachments: (attachmentRows ?? []).map((row) => normalizeAttachment(row as TaskAttachment))
  };
}

export async function getHistoryViewData(): Promise<HistoryViewData> {
  const today = new Date().toISOString().slice(0, 10);
  const [
    completedQuery,
    carriedQuery,
    archivedQuery,
    delayedQuery,
    attachmentsQuery
  ] = await Promise.all([
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .eq('status', 'done')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(24),
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .not('carried_from_instance_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(24),
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false, nullsFirst: false })
      .limit(24),
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .eq('status', 'open')
      .is('archived_at', null)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(24),
    supabaseAdmin.from('task_attachments').select('*', { count: 'exact', head: true })
  ]);

  if (completedQuery.error) throw error(500, completedQuery.error.message);
  if (carriedQuery.error) throw error(500, carriedQuery.error.message);
  if (archivedQuery.error) throw error(500, archivedQuery.error.message);
  if (delayedQuery.error) throw error(500, delayedQuery.error.message);
  if (attachmentsQuery.error) throw error(500, attachmentsQuery.error.message);

  const completedTasks = sortInstances((completedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const carriedTasks = sortInstances((carriedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const archivedTasks = sortInstances((archivedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const delayedTasks = sortInstances((delayedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));

  return {
    completedTasks,
    carriedTasks,
    archivedTasks,
    delayedTasks,
    attachmentCount: attachmentsQuery.count ?? 0,
    summary: {
      completedCount: completedTasks.length,
      carriedCount: carriedTasks.length,
      archivedCount: archivedTasks.length,
      delayedCount: delayedTasks.length
    }
  };
}

export async function searchPlannerData(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return {
      tasks: [],
      inbox: [],
      notes: [],
      attachments: []
    };
  }

  const pattern = `%${trimmed}%`;
  const [tasksQuery, inboxQuery, notesQuery, attachmentsQuery] = await Promise.all([
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .ilike('title_snapshot', pattern)
      .order('updated_at', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('inbox_items')
      .select('*')
      .ilike('title', pattern)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('note_blocks')
      .select('document_id, text, notes_documents!inner(id, title)')
      .ilike('text', pattern)
      .order('updated_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('task_attachments')
      .select('id, file_name, task_instance_id')
      .ilike('file_name', pattern)
      .limit(6)
  ]);

  if (tasksQuery.error) throw error(500, tasksQuery.error.message);
  if (inboxQuery.error) throw error(500, inboxQuery.error.message);
  if (notesQuery.error) throw error(500, notesQuery.error.message);
  if (attachmentsQuery.error) throw error(500, attachmentsQuery.error.message);

  return {
    tasks: (tasksQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)),
    inbox: (inboxQuery.data ?? []).map((row) => normalizeInboxItem(row as InboxItem)),
    notes: (notesQuery.data ?? []).map((row) => {
      const noteRow = row as Record<string, unknown>;
      const document = (noteRow.notes_documents ?? {}) as Record<string, unknown>;
      return {
        id: String(document.id ?? ''),
        title: String(document.title ?? 'Untitled'),
        snippet: String(noteRow.text ?? '').slice(0, 120)
      };
    }),
    attachments: (attachmentsQuery.data ?? []) as SearchResults['attachments']
  };
}

export async function createInboxItem(payload: {
  title: string;
  notes?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  hours_needed?: number | null;
  category?: string | null;
  preferred_day?: DayName | null;
  preferred_week?: number | null;
}): Promise<InboxItem> {
  const title = payload.title.trim();
  if (!title) {
    throw error(400, 'Title is required');
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('inbox_items')
    .insert({
      title,
      notes: payload.notes ?? null,
      priority: payload.priority ?? 'medium',
      due_date: payload.due_date ?? null,
      hours_needed: payload.hours_needed ?? null,
      category: payload.category ?? null,
      preferred_day: payload.preferred_day ?? null,
      preferred_week: payload.preferred_week ?? null,
      source_type: 'inbox'
    })
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  return normalizeInboxItem(data as InboxItem);
}

export async function updateInboxItem(
  id: string,
  updates: Partial<Pick<InboxItem, 'title' | 'notes' | 'priority' | 'due_date' | 'hours_needed' | 'category' | 'preferred_day' | 'preferred_week' | 'archived_at'>>
): Promise<InboxItem> {
  const { data, error: updateError } = await supabaseAdmin
    .from('inbox_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) throw error(500, updateError.message);

  return normalizeInboxItem(data as InboxItem);
}

export async function promoteInboxItem(input: {
  inboxItemId: string;
  kind: 'weekly' | 'monthly';
  monthKey: string;
  weekKey?: string | null;
  dayName?: DayName | null;
}): Promise<TaskInstance> {
  const normalizedMonthKey = normalizeMonthKey(input.monthKey);
  const normalizedWeekKey =
    input.kind === 'weekly' ? normalizeWeekKey(input.weekKey ?? getWeekKey()) : input.weekKey ?? null;

  const { data: inboxRow, error: inboxError } = await supabaseAdmin
    .from('inbox_items')
    .select('*')
    .eq('id', input.inboxItemId)
    .single();

  if (inboxError || !inboxRow) {
    throw error(404, 'Inbox item not found');
  }

  const inboxItem = normalizeInboxItem(inboxRow as InboxItem);
  const instanceId = crypto.randomUUID();

  const payload = {
    id: instanceId,
    template_id: null,
    title_snapshot: inboxItem.title,
    instance_kind: input.kind,
    week_key: input.kind === 'weekly' ? normalizedWeekKey : input.weekKey ?? null,
    month_key: normalizedMonthKey,
    week_of_month: inferWeekIndex(input.kind === 'weekly' ? normalizedWeekKey : input.weekKey ?? null, normalizedMonthKey),
    day_name: input.dayName ?? inboxItem.preferred_day,
    status: 'open',
    completed_at: null,
    priority: inboxItem.priority,
    due_date: inboxItem.due_date,
    hours_needed: inboxItem.hours_needed,
    category: inboxItem.category,
    source_type: 'inbox',
    preferred_day: inboxItem.preferred_day,
    preferred_week: inboxItem.preferred_week,
    carried_from_instance_id: null,
    archived_at: null,
    archive_reason: null,
    linked_schedule_block_id: null,
    sort_order: null,
    source_context: {
      promoted_from: 'inbox',
      inbox_item_id: inboxItem.id
    }
  } satisfies Omit<TaskInstance, 'created_at' | 'updated_at'>;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('task_instances')
    .insert(payload)
    .select('*')
    .single();

  if (insertError) throw error(500, insertError.message);

  await updateInboxItem(inboxItem.id, {
    archived_at: new Date().toISOString()
  });

  const { error: linkError } = await supabaseAdmin
    .from('inbox_items')
    .update({
      promoted_to_instance_id: instanceId,
      updated_at: new Date().toISOString()
    })
    .eq('id', inboxItem.id);

  if (linkError) throw error(500, linkError.message);

  return normalizeTask(inserted as TaskInstance);
}

type Slot = { date: string; dayName: DayName; weekKey: string; startMinutes: number; endMinutes: number };

function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((entry) => Number.parseInt(entry, 10));
  return hours * 60 + minutes;
}

function minutesToTimeString(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function getBaseSlots(monthKey: string, settings: PlannerSettings): Slot[] {
  const workStart = timeStringToMinutes(settings.working_day_start);
  const workEnd = timeStringToMinutes(settings.working_day_end);
  const breakStart = timeStringToMinutes(settings.break_start);
  const breakEnd = timeStringToMinutes(settings.break_end);

  return getWorkingDaysInMonth(monthKey).flatMap((date) => {
    const iso = format(date, 'yyyy-MM-dd');
    const dayName = format(date, 'EEEE') as DayName;
    const weekKey = getWeekKey(date);

    return [
      { date: iso, dayName, weekKey, startMinutes: workStart, endMinutes: breakStart },
      { date: iso, dayName, weekKey, startMinutes: breakEnd, endMinutes: workEnd }
    ].filter((slot) => slot.endMinutes - slot.startMinutes >= 30);
  });
}

function sortTasksForScheduling(tasks: TaskInstance[]): TaskInstance[] {
  return [...tasks].sort((left, right) => {
    const leftDue = left.due_date ?? '9999-12-31';
    const rightDue = right.due_date ?? '9999-12-31';

    return (
      leftDue.localeCompare(rightDue) ||
      priorityWeight(left.priority) - priorityWeight(right.priority) ||
      getTaskHours(right) - getTaskHours(left) ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  });
}

function slotMatchesTask(slot: Slot, task: TaskInstance): boolean {
  if (task.day_name && slot.dayName !== task.day_name) return false;
  if (task.week_key && slot.weekKey !== task.week_key) return false;
  if (task.preferred_week && inferWeekIndex(slot.weekKey, task.month_key) !== task.preferred_week) return false;
  return true;
}

export async function generateScheduleForMonth(monthKeyInput: string): Promise<{
  createdBlocks: number;
  overflowHours: number;
  warnings: string[];
}> {
  const monthKey = normalizeMonthKey(monthKeyInput);
  await ensureMonthPlanInstances(monthKey);

  const [settings, blocks, tasks] = await Promise.all([
    ensurePlannerSettings(),
    listScheduleBlocksForMonth(monthKey),
    listInstances(monthKey)
  ]);

  const lockedBlocks = blocks.filter((block) => block.locked);
  const unlockedBlocks = blocks.filter((block) => !block.locked);

  if (unlockedBlocks.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('schedule_blocks')
      .delete()
      .eq('month_key', monthKey)
      .eq('locked', false);

    if (deleteError) throw error(500, deleteError.message);
  }

  let slots = getBaseSlots(monthKey, settings);

  for (const block of lockedBlocks) {
    const blockStart = timeStringToMinutes(block.starts_at);
    const blockEnd = timeStringToMinutes(block.ends_at);
    slots = slots.flatMap((slot) => {
      if (slot.date !== block.scheduled_for) return [slot];
      if (blockEnd <= slot.startMinutes || blockStart >= slot.endMinutes) return [slot];

      const next: Slot[] = [];
      if (blockStart > slot.startMinutes) {
        next.push({ ...slot, endMinutes: blockStart });
      }
      if (blockEnd < slot.endMinutes) {
        next.push({ ...slot, startMinutes: blockEnd + settings.buffer_minutes });
      }
      return next.filter((entry) => entry.endMinutes - entry.startMinutes >= 30);
    });
  }

  const activeTasks = sortTasksForScheduling(
    tasks.filter((task) => task.status === 'open' && task.archived_at === null)
  );
  const inserts: Omit<ScheduleBlock, 'created_at' | 'updated_at'>[] = [];
  let overflowMinutes = 0;

  for (const task of activeTasks) {
    let remainingMinutes = Math.round(getTaskHours(task) * 60);

    while (remainingMinutes > 0) {
      const slotIndex = slots.findIndex((slot) => slotMatchesTask(slot, task));
      if (slotIndex < 0) {
        overflowMinutes += remainingMinutes;
        break;
      }

      const slot = slots[slotIndex];
      const chunkMinutes = Math.min(remainingMinutes, slot.endMinutes - slot.startMinutes, 120);
      const startMinutes = slot.startMinutes;
      const endMinutes = startMinutes + chunkMinutes;

      inserts.push({
        id: crypto.randomUUID(),
        task_instance_id: task.id,
        week_key: slot.weekKey,
        month_key: monthKey,
        day_name: slot.dayName,
        scheduled_for: slot.date,
        starts_at: minutesToTimeString(startMinutes),
        ends_at: minutesToTimeString(endMinutes),
        duration_hours: Number((chunkMinutes / 60).toFixed(2)),
        locked: false,
        status: 'planned',
        source_type: task.source_type,
        title_snapshot: task.title_snapshot
      });

      remainingMinutes -= chunkMinutes;

      const remainingSlot = {
        ...slot,
        startMinutes: endMinutes + settings.buffer_minutes
      };

      if (remainingSlot.endMinutes - remainingSlot.startMinutes >= 30) {
        slots[slotIndex] = remainingSlot;
      } else {
        slots.splice(slotIndex, 1);
      }
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('schedule_blocks').insert(inserts);
    if (insertError) throw error(500, insertError.message);
  }

  const warnings: string[] = [];
  if (overflowMinutes > 0) {
    warnings.push(`${(overflowMinutes / 60).toFixed(1)}h could not be scheduled inside working hours.`);
  }
  if (activeTasks.some((task) => getTaskHours(task) > 2)) {
    warnings.push('Long tasks were split into smaller schedule blocks.');
  }
  if (lockedBlocks.length > 0) {
    warnings.push('Locked blocks were preserved during generate.');
  }

  return {
    createdBlocks: inserts.length,
    overflowHours: Number((overflowMinutes / 60).toFixed(1)),
    warnings
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
