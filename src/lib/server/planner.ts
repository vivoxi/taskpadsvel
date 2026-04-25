import { error } from '@sveltejs/kit';
import {
  addDays,
  format
} from 'date-fns';
import { cloneBlocks, createBlock, normalizeBlocks, toNoteBlockPayload } from '$lib/planner/blocks';
import { mergeIntoDayBuckets } from '$lib/planner/tasks';
import {
  DAY_NAMES,
  type CapacitySnapshot,
  type DayName,
  type DocumentKind,
  type HistoryViewData,
  type MonthViewData,
  type NoteCategory,
  type NotesDocument,
  type NotesViewData,
  type OneTimeViewData,
  type PlannerBlock,
  type PlannerSettings,
  type ScheduleBlock,
  type ScheduleHealth,
  type SearchResults,
  type SoftAssignment,
  type TaskAttachment,
  type TaskInstance,
  type TaskSourceType,
  type TaskTemplate,
  type TasksByDay,
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
  toIsoDate,
  weekLabel
} from '$lib/planner/dates';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPublicUploadPath } from '$lib/server/uploads';

const SETTINGS_DEFAULTS: Omit<PlannerSettings, 'id' | 'created_at' | 'updated_at'> = {
  label: 'Primary schedule',
  working_day_start: '10:00',
  working_day_end: '17:00',
  break_start: '13:00',
  break_end: '14:00',
  buffer_minutes: 0,
  theme_mode: 'system'
};

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
  const publicUrl = row.public_url ?? (row.file_path ? getPublicUploadPath(row.file_path) : null);
  return {
    id: row.id ?? crypto.randomUUID(),
    task_instance_id: row.task_instance_id ?? null,
    note_document_id: row.note_document_id ?? null,
    file_name: row.file_name ?? 'attachment',
    file_path: row.file_path ?? '',
    file_size: typeof row.file_size === 'number' ? row.file_size : null,
    mime_type: row.mime_type ?? null,
    public_url: publicUrl,
    created_at: row.created_at ?? new Date().toISOString()
  };
}

function normalizeDocument(row: Partial<NotesDocument & { category_id?: string | null }>): NotesDocument {
  const categoryId = row.category_id ?? row.folder_id ?? null;
  const starred = row.starred === true || row.is_starred === true;
  return {
    id: row.id ?? crypto.randomUUID(),
    title: row.title ?? 'Untitled',
    slug: row.slug ?? null,
    kind: row.kind === 'one-time' ? 'one-time' : 'note',
    category_id: categoryId,
    folder_id: categoryId,
    starred,
    is_starred: starred,
    deleted_at: row.deleted_at ?? null,
    color: row.color ?? null,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    cover_image_url: row.cover_image_url ?? null,
    word_count: typeof row.word_count === 'number' ? row.word_count : 0,
    preview: row.preview ?? '',
    attachment_count: typeof row.attachment_count === 'number' ? row.attachment_count : 0,
    first_image_url: row.first_image_url ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString()
  };
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMissingRelationError(message: string | undefined): boolean {
  const lower = message?.toLowerCase() ?? '';
  return lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('could not find');
}

function extractHashTagsFromBlocks(blocks: PlannerBlock[]): string[] {
  const tags = new Set<string>();
  for (const block of blocks) {
    const text = plainText(block.text ?? '');
    for (const match of text.matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,40})/gu)) {
      tags.add(match[2].toLocaleLowerCase('tr-TR'));
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right, 'tr'));
}

async function getNoteCategories(): Promise<NoteCategory[]> {
  const { data, error: queryError } = await supabaseAdmin
    .from('note_categories')
    .select('id, name, parent_id, color, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (queryError) throw error(500, queryError.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    color: row.color ? String(row.color) : '#6366f1',
    icon: null,
    sort_order: Number(row.sort_order ?? 0)
  }));
}

async function getNoteTagData(): Promise<Pick<NotesViewData, 'tags' | 'noteTags'>> {
  const [{ data: tags, error: tagsError }, { data: noteTags, error: noteTagsError }] = await Promise.all([
    supabaseAdmin
      .from('tags')
      .select('id, name, user_id')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('note_tags')
      .select('note_id, tag_id')
  ]);

  const missingTagsTable =
    isMissingRelationError(tagsError?.message) ||
    isMissingRelationError(noteTagsError?.message);

  if (missingTagsTable) {
    return { tags: [], noteTags: [] };
  }

  if (tagsError) throw error(500, tagsError.message);
  if (noteTagsError) throw error(500, noteTagsError.message);

  return {
    tags: (tags ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      user_id: row.user_id ? String(row.user_id) : null
    })),
    noteTags: (noteTags ?? []).map((row) => ({
      note_id: String(row.note_id),
      tag_id: String(row.tag_id)
    }))
  };
}

async function syncNoteTags(documentId: string, blocks: PlannerBlock[]) {
  const tagNames = extractHashTagsFromBlocks(blocks);

  const { error: deleteError } = await supabaseAdmin
    .from('note_tags')
    .delete()
    .eq('note_id', documentId);

  if (deleteError) {
    if (isMissingRelationError(deleteError.message)) return null;
    throw error(500, deleteError.message);
  }

  if (tagNames.length === 0) {
    const { data: tags, error: tagsError } = await supabaseAdmin
      .from('tags')
      .select('id, name, user_id')
      .order('name', { ascending: true });
    if (tagsError) {
      if (isMissingRelationError(tagsError.message)) return null;
      throw error(500, tagsError.message);
    }
    return {
      tags: (tags ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        user_id: row.user_id ? String(row.user_id) : null
      })),
      noteTags: []
    };
  }

  const { data: existingTags, error: existingTagsError } = await supabaseAdmin
    .from('tags')
    .select('id, name, user_id')
    .in('name', tagNames);

  if (existingTagsError) {
    if (isMissingRelationError(existingTagsError.message)) return null;
    throw error(500, existingTagsError.message);
  }

  const existingNames = new Set((existingTags ?? []).map((tag) => String(tag.name)));
  const missingNames = tagNames.filter((name) => !existingNames.has(name));

  let insertedTags: Array<{ id: string; name: string; user_id: string | null }> = [];
  if (missingNames.length > 0) {
    const { data: inserted, error: insertTagsError } = await supabaseAdmin
      .from('tags')
      .insert(missingNames.map((name) => ({ name, user_id: null })))
      .select('id, name, user_id');

    if (insertTagsError) {
      if (isMissingRelationError(insertTagsError.message)) return null;
      throw error(500, insertTagsError.message);
    }
    insertedTags = (inserted ?? []) as Array<{ id: string; name: string; user_id: string | null }>;
  }

  const tagRows = [...(existingTags ?? []), ...insertedTags];

  const { data: normalizedTagRows, error: reloadTagsError } = await supabaseAdmin
    .from('tags')
    .select('id, name, user_id');

  if (reloadTagsError) {
    if (isMissingRelationError(reloadTagsError.message)) return null;
    throw error(500, reloadTagsError.message);
  }

  const currentTagRows = tagRows.filter((tag) => tagNames.includes(String(tag.name)));
  const links = currentTagRows.map((tag) => ({
    note_id: documentId,
    tag_id: String(tag.id)
  }));

  if (links.length > 0) {
    const { error: linkError } = await supabaseAdmin
      .from('note_tags')
      .upsert(links, { onConflict: 'note_id,tag_id' });

    if (linkError) {
      if (isMissingRelationError(linkError.message)) return null;
      throw error(500, linkError.message);
    }
  }

  return {
    tags: (normalizedTagRows ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      user_id: row.user_id ? String(row.user_id) : null
    })),
    noteTags: links
  };
}

async function createNoteVersionSnapshot(documentId: string, blocks: PlannerBlock[]) {
  const { data: latestVersion, error: latestVersionError } = await supabaseAdmin
    .from('note_versions')
    .select('created_at')
    .eq('note_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    if (isMissingRelationError(latestVersionError.message)) return;
    throw error(500, latestVersionError.message);
  }

  const latestTime = latestVersion?.created_at ? new Date(latestVersion.created_at).getTime() : 0;
  if (latestTime && Date.now() - latestTime < 2 * 60 * 1000) return;

  const { error: versionError } = await supabaseAdmin
    .from('note_versions')
    .insert({
      note_id: documentId,
      content: blocks
    });

  if (versionError && !isMissingRelationError(versionError.message)) {
    throw error(500, versionError.message);
  }
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

    return (
      Number(left.archived_at !== null) - Number(right.archived_at !== null) ||
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

function buildCapacitySnapshot(
  tasks: TaskInstance[],
  settings: PlannerSettings,
  scope: { monthKey?: string; weekKey?: string },
  softAssignments: Partial<Record<string, SoftAssignment>> = {}
): CapacitySnapshot {
  const activeTasks = tasks.filter((task) => task.archived_at === null);
  const availableHours =
    scope.monthKey
      ? getWorkingDaysInMonth(scope.monthKey).length * getWorkingHoursPerDay(settings)
      : getWorkingDaysInWeek(scope.weekKey ?? getWeekKey()).length * getWorkingHoursPerDay(settings);
  const plannedHours = activeTasks.reduce((sum, task) => sum + getTaskHours(task), 0);
  const unassignedHours = activeTasks
    .filter(
      (task) =>
        task.status === 'open' &&
        task.day_name === null &&
        !softAssignments[task.id]
    )
    .reduce((sum, task) => sum + getTaskHours(task), 0);

  return {
    available_hours: Number(availableHours.toFixed(1)),
    planned_hours: Number(plannedHours.toFixed(1)),
    remaining_hours: Number(Math.max(availableHours - plannedHours, 0).toFixed(1)),
    overflow_hours: Number(Math.max(plannedHours - availableHours, 0).toFixed(1)),
    unassigned_hours: Number(unassignedHours.toFixed(1))
  };
}

function buildScheduleHealth(tasks: TaskInstance[], blocks: ScheduleBlock[], capacity: CapacitySnapshot): ScheduleHealth {
  const splitCandidateCount = tasks.filter((task) => getTaskHours(task) > 2).length;
  const overflowWarning =
    capacity.overflow_hours > 0
      ? `${capacity.overflow_hours.toFixed(1)}h over capacity`
      : null;

  return {
    block_count: blocks.length,
    locked_count: blocks.filter((block) => block.locked).length,
    split_candidate_count: splitCandidateCount,
    overflow_warning: overflowWarning
  };
}

function buildSoftAssignments(
  tasks: TaskInstance[],
  blocks: ScheduleBlock[]
): Partial<Record<string, SoftAssignment>> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const assignments = new Map<string, SoftAssignment>();

  const sortedBlocks = [...blocks].sort((left, right) => {
    return (
      left.scheduled_for.localeCompare(right.scheduled_for) ||
      left.starts_at.localeCompare(right.starts_at)
    );
  });

  for (const block of sortedBlocks) {
    if (!block.task_instance_id) continue;
    if (assignments.has(block.task_instance_id)) continue;

    const task = taskById.get(block.task_instance_id);
    if (!task || task.archived_at !== null) continue;
    if (task.day_name !== null && task.week_key !== null) continue;

    assignments.set(block.task_instance_id, {
      taskInstanceId: block.task_instance_id,
      weekKey: block.week_key,
      dayName: block.day_name,
      scheduledFor: block.scheduled_for,
      startsAt: block.starts_at
    });
  }

  return Object.fromEntries(assignments);
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

function getTemplateDefaultSyncUpdates(
  instance: TaskInstance,
  template: TaskTemplate
): Partial<TaskInstance> {
  const updates: Partial<TaskInstance> = {};
  const previousPreferredDay = instance.preferred_day;
  const nextPreferredDay = template.preferred_day;

  if (instance.preferred_day !== nextPreferredDay) {
    updates.preferred_day = nextPreferredDay;
  }

  if (instance.day_name === null || instance.day_name === previousPreferredDay) {
    updates.day_name = nextPreferredDay;
  }

  const previousPreferredWeek = instance.preferred_week;
  const nextPreferredWeek = template.kind === 'monthly' ? template.preferred_week_of_month : instance.week_of_month;

  if (instance.instance_kind === 'monthly') {
    if (instance.preferred_week !== nextPreferredWeek) {
      updates.preferred_week = nextPreferredWeek;
    }

    if (instance.week_of_month === null || instance.week_of_month === previousPreferredWeek) {
      updates.week_of_month = nextPreferredWeek;
      updates.week_key = getWeekKeyForPreferredWeek(instance.month_key, nextPreferredWeek);
    }
  }

  return updates;
}

async function syncExistingInstancesToTemplateDefaults(
  templates: TaskTemplate[],
  instances: TaskInstance[]
): Promise<TaskInstance[]> {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const updatedAt = new Date().toISOString();

  // Collect all instances that need syncing
  type PendingSync = { index: number; instance: TaskInstance; updates: Partial<TaskInstance> };
  const pending: PendingSync[] = [];

  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    if (!instance.template_id || instance.archived_at !== null) continue;

    const template = templateById.get(instance.template_id);
    if (!template) continue;

    const updates = getTemplateDefaultSyncUpdates(instance, template);
    if (Object.keys(updates).length === 0) continue;

    pending.push({ index, instance, updates });
  }

  if (pending.length === 0) return instances;

  // Run all updates in parallel instead of sequentially
  const results = await Promise.all(
    pending.map(({ instance, updates }) =>
      supabaseAdmin
        .from('task_instances')
        .update({ ...updates, updated_at: updatedAt })
        .eq('id', instance.id)
    )
  );

  for (const { error: updateError } of results) {
    if (updateError) throw error(500, updateError.message);
  }

  const nextInstances = [...instances];
  for (const { index, instance, updates } of pending) {
    nextInstances[index] = normalizeTask({ ...instance, ...updates, updated_at: updatedAt });
  }

  return nextInstances;
}

export async function ensureMonthPlanInstances(inputMonthKey: string): Promise<{
  monthKey: string;
  templates: TaskTemplate[];
  instances: TaskInstance[];
}> {
  const monthKey = normalizeMonthKey(inputMonthKey);
  const [templates, rawExistingInstances] = await Promise.all([listTemplates(), listInstances(monthKey)]);
  const existingInstances = await syncExistingInstancesToTemplateDefaults(templates, rawExistingInstances);

  if (!canAutoMaterializeMonthKey(monthKey)) {
    return {
      monthKey,
      templates,
      instances: existingInstances
    };
  }

  const weeks = getBoardWeeksForMonth(monthKey);
  const missingRows: Omit<TaskInstance, 'created_at' | 'updated_at'>[] = [];
  const existingWeeklyKeys = new Set(
    existingInstances
      .filter((instance) => instance.instance_kind === 'weekly' && instance.template_id && instance.week_key)
      .map((instance) => `${instance.template_id}:${instance.week_key}`)
  );
  const existingMonthlyTemplateIds = new Set(
    existingInstances
      .filter((instance) => instance.instance_kind === 'monthly' && instance.template_id)
      .map((instance) => instance.template_id as string)
  );

  const activeWeeklyTemplates = templates.filter((template) => template.active && template.kind === 'weekly');
  const activeMonthlyTemplates = templates.filter((template) => template.active && template.kind === 'monthly');

  for (const template of activeWeeklyTemplates) {
    for (const week of weeks) {
      const weeklyKey = `${template.id}:${week.weekKey}`;
      if (existingWeeklyKeys.has(weeklyKey)) continue;

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
        due_date: null,
        hours_needed: template.hours_needed_default ?? template.estimate_hours,
        category: null,
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
      existingWeeklyKeys.add(weeklyKey);
    }
  }

  for (const template of activeMonthlyTemplates) {
    if (existingMonthlyTemplateIds.has(template.id)) continue;

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
      due_date: null,
      hours_needed: template.hours_needed_default ?? template.estimate_hours,
      category: null,
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
    existingMonthlyTemplateIds.add(template.id);
  }

  let insertedRows: TaskInstance[] = [];
  if (missingRows.length > 0) {
    const { data, error: insertError } = await supabaseAdmin
      .from('task_instances')
      .insert(missingRows)
      .select('*');
    if (insertError) {
      throw error(500, insertError.message);
    }

    insertedRows = (data ?? []).map((row) => normalizeTask(row as TaskInstance));
  }

  return {
    monthKey,
    templates,
    instances: missingRows.length > 0 ? sortInstances([...existingInstances, ...insertedRows]) : existingInstances
  };
}

export async function getWeekViewData(inputWeekKey: string): Promise<WeekViewData> {
  const weekKey = normalizeWeekKey(inputWeekKey);
  const monthKey = getBoardMonthKeyForWeek(weekKey);

  // Run all independent fetches in a single parallel batch to avoid waterfall round-trips.
  // weekly_notes and schedule_blocks don't depend on monthPlan so they start immediately.
  const [settings, monthPlan, { data: noteRows, error: notesError }, blocks] = await Promise.all([
    ensurePlannerSettings(),
    ensureMonthPlanInstances(monthKey),
    supabaseAdmin.from('weekly_notes').select('*').eq('week_key', weekKey),
    listScheduleBlocksForMonth(monthKey)
  ]);

  if (notesError) throw error(500, notesError.message);

  const weekIndex = getWeekIndexForMonth(weekKey, monthKey);
  // Derive weekTasks from the already-loaded monthPlan instead of a separate DB query.
  const weekTasks = sortInstances(
    monthPlan.instances.filter((i) => i.week_key === weekKey && i.archived_at === null)
  );
  const monthTasksById = new Map(monthPlan.instances.map((task) => [task.id, task]));
  const weekBlocks = blocks.filter((block) => block.week_key === weekKey);
  const softAssignments = buildSoftAssignments(monthPlan.instances, weekBlocks);
  const softAssignedTaskIds = Object.keys(softAssignments);
  const monthlyDayTasks = monthPlan.instances.filter(
    (task) =>
      task.instance_kind === 'monthly' &&
      task.archived_at === null &&
      task.day_name !== null &&
      (task.week_of_month === null || task.week_of_month === weekIndex)
  );
  const scheduleDayTasks = softAssignedTaskIds
    .map((taskId) => {
      const assignment = softAssignments[taskId];
      if (!assignment?.dayName) return null;
      const task = monthTasksById.get(taskId);
      if (!task || task.archived_at !== null) return null;
      return task;
    })
    .filter((task): task is TaskInstance => task !== null);
  const seenTaskIds = new Set<string>();
  const tasksByDay: TasksByDay = {};

  mergeIntoDayBuckets(tasksByDay, [...weekTasks, ...monthlyDayTasks], seenTaskIds);
  mergeIntoDayBuckets(
    tasksByDay,
    scheduleDayTasks,
    seenTaskIds,
    (task) => softAssignments[task.id]?.dayName
  );

  const notesByDay = new Map<string, PlannerBlock[]>();
  for (const row of noteRows ?? []) {
    notesByDay.set(row.day_name, normalizeBlocks(row.blocks_json));
  }

  const capacity = buildCapacitySnapshot(weekTasks, settings, { weekKey }, softAssignments);

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
    tasks: weekTasks,
    tasksByDay,
    softAssignedTaskIds,
    settings,
    capacity,
    schedule: buildScheduleHealth(weekTasks, weekBlocks, capacity)
  };
}

export async function getMonthViewData(inputMonthKey: string): Promise<MonthViewData> {
  const normalizedMonthKey = normalizeMonthKey(inputMonthKey);
  const [{ monthKey, templates, instances }, settings, blocks] = await Promise.all([
    ensureMonthPlanInstances(normalizedMonthKey),
    ensurePlannerSettings(),
    listScheduleBlocksForMonth(normalizedMonthKey)
  ]);
  const activeInstances = instances.filter((task) => task.archived_at === null);
  const softAssignments = buildSoftAssignments(activeInstances, blocks);
  const capacity = buildCapacitySnapshot(activeInstances, settings, {
    monthKey
  }, softAssignments);

  return {
    monthKey,
    label: monthLabel(monthKey),
    weeks: getBoardWeeksForMonth(monthKey),
    templates,
    instances: activeInstances,
    softAssignments,
    settings,
    capacity,
    schedule: buildScheduleHealth(activeInstances, blocks, capacity)
  };
}

/** Lighter load for the calendar dashboard — skips schedule blocks, soft assignments,
 *  and capacity/health calculations which are not shown on that view. */
export async function getCalendarViewData(inputMonthKey: string): Promise<Pick<MonthViewData, 'monthKey' | 'label' | 'weeks' | 'instances'>> {
  const normalizedMonthKey = normalizeMonthKey(inputMonthKey);
  const { monthKey, instances } = await ensureMonthPlanInstances(normalizedMonthKey);
  const activeInstances = instances.filter((task) => task.archived_at === null);

  return {
    monthKey,
    label: monthLabel(monthKey),
    weeks: getBoardWeeksForMonth(monthKey),
    instances: activeInstances
  };
}

async function getDocumentWorkspaceData(
  kind: DocumentKind,
  selectedDocumentId: string | null | undefined
): Promise<Omit<NotesViewData, 'categories' | 'tags' | 'noteTags'>> {
  const { data: initialDocuments, error: docsError } = await supabaseAdmin
    .from('notes_documents')
    .select('*')
    .eq('kind', kind)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (docsError) {
    throw error(500, docsError.message);
  }

  let documents = (initialDocuments ?? []).map((row) => normalizeDocument(row as NotesDocument));

  if (documents.length === 0) {
    const now = new Date().toISOString();
    const seedTitle = kind === 'one-time' ? 'One-time tasks' : 'Workspace';
    const seedDocument = {
      id: crypto.randomUUID(),
      title: seedTitle,
      slug: kind === 'one-time' ? 'one-time-tasks' : 'workspace',
      kind,
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
        type: kind === 'one-time' ? 'checklist' : 'heading',
        text:
          kind === 'one-time'
            ? 'First one-time task'
            : 'Workspace',
        checked: kind === 'one-time' ? false : null,
        level: kind === 'one-time' ? null : 1,
        sort_order: 0
      },
      {
        id: crypto.randomUUID(),
        document_id: seedDocument.id,
        type: kind === 'one-time' ? 'checklist' : 'paragraph',
        text:
          kind === 'one-time'
            ? 'Second one-time task'
            : 'Use this space for reference material, context, and thought work that should not drive planning logic.',
        checked: kind === 'one-time' ? false : null,
        level: null,
        sort_order: 1
      }
    ]);

    if (blockError) {
      throw error(500, blockError.message);
    }

    documents = [normalizeDocument(seedDocument)];
  }

  const documentIds = documents.map((document) => document.id);
  const previewByDocument = new Map<string, string>();
  const firstImageByDocument = new Map<string, string>();
  const attachmentCountByDocument = new Map<string, number>();

  if (documentIds.length > 0) {
    const [{ data: previewRows, error: previewError }, { data: attachmentRows, error: attachmentSummaryError }] =
      await Promise.all([
        supabaseAdmin
          .from('note_blocks')
          .select('document_id, type, text, sort_order')
          .in('document_id', documentIds)
          .lte('sort_order', 5)
          .order('sort_order', { ascending: true }),
        kind === 'note'
          ? supabaseAdmin
              .from('task_attachments')
              .select('note_document_id, file_path, mime_type')
              .in('note_document_id', documentIds)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

    if (previewError) throw error(500, previewError.message);
    if (attachmentSummaryError) throw error(500, attachmentSummaryError.message);

    for (const row of previewRows ?? []) {
      const documentId = String(row.document_id);
      const blockType = String(row.type);
      const text = typeof row.text === 'string' ? row.text : '';
      if (!previewByDocument.has(documentId)) {
        const preview = plainText(text);
        if (preview && blockType !== 'divider' && blockType !== 'image') {
          previewByDocument.set(documentId, preview.slice(0, 180));
        }
      }
      if (!firstImageByDocument.has(documentId) && blockType === 'image' && text) {
        firstImageByDocument.set(documentId, text);
      }
    }

    for (const row of attachmentRows ?? []) {
      const documentId = String(row.note_document_id ?? '');
      if (!documentId) continue;
      attachmentCountByDocument.set(documentId, (attachmentCountByDocument.get(documentId) ?? 0) + 1);
      if (!firstImageByDocument.has(documentId) && String(row.mime_type ?? '').startsWith('image/') && row.file_path) {
        firstImageByDocument.set(documentId, getPublicUploadPath(String(row.file_path)));
      }
    }

    documents = documents.map((document) => ({
      ...document,
      preview: previewByDocument.get(document.id) ?? '',
      attachment_count: attachmentCountByDocument.get(document.id) ?? 0,
      first_image_url: document.cover_image_url ?? firstImageByDocument.get(document.id) ?? null
    }));
  }

  const selectableDocuments = documents.filter((document) => !document.deleted_at);
  const selectedId =
    documents.find((document) => document.id === selectedDocumentId)?.id ??
    selectableDocuments[0]?.id ??
    documents[0]?.id;

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

  let attachments: TaskAttachment[] = [];
  if (kind === 'note') {
    const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
      .from('task_attachments')
      .select('*')
      .eq('note_document_id', selectedId)
      .order('created_at', { ascending: false });

    if (attachmentError) {
      throw error(500, attachmentError.message);
    }

    attachments = (attachmentRows ?? []).map((row) => normalizeAttachment(row as TaskAttachment));
  }

  return {
    selectedDocumentId: selectedId,
    documents,
    blocks: normalizeBlocks(blockRows),
    attachments
  };
}

export async function getNotesViewData(selectedDocumentId: string | null | undefined): Promise<NotesViewData> {
  const [workspace, categories, tagData] = await Promise.all([
    getDocumentWorkspaceData('note', selectedDocumentId),
    getNoteCategories(),
    getNoteTagData()
  ]);
  return { ...workspace, categories, ...tagData };
}

export async function getOneTimeViewData(
  selectedDocumentId: string | null | undefined
): Promise<OneTimeViewData> {
  const view = await getDocumentWorkspaceData('one-time', selectedDocumentId);
  return {
    selectedDocumentId: view.selectedDocumentId,
    documents: view.documents,
    blocks: view.blocks
  };
}

export async function getHistoryViewData(): Promise<HistoryViewData> {
  const [
    completedQuery,
    carriedQuery,
    archivedQuery,
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
    supabaseAdmin.from('task_attachments').select('*', { count: 'exact', head: true })
  ]);

  if (completedQuery.error) throw error(500, completedQuery.error.message);
  if (carriedQuery.error) throw error(500, carriedQuery.error.message);
  if (archivedQuery.error) throw error(500, archivedQuery.error.message);
  if (attachmentsQuery.error) throw error(500, attachmentsQuery.error.message);

  const completedTasks = sortInstances((completedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const carriedTasks = sortInstances((carriedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));
  const archivedTasks = sortInstances((archivedQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)));

  return {
    completedTasks,
    carriedTasks,
    archivedTasks,
    attachmentCount: attachmentsQuery.count ?? 0,
    summary: {
      completedCount: completedTasks.length,
      carriedCount: carriedTasks.length,
      archivedCount: archivedTasks.length
    }
  };
}

export async function searchPlannerData(query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return {
      tasks: [],
      notes: [],
      attachments: []
    };
  }

  const pattern = `%${trimmed}%`;
  const [tasksQuery, notesQuery, attachmentsQuery] = await Promise.all([
    supabaseAdmin
      .from('task_instances')
      .select('*')
      .ilike('title_snapshot', pattern)
      .order('updated_at', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('note_blocks')
      .select('document_id, text, notes_documents!inner(id, title, kind)')
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
  if (notesQuery.error) throw error(500, notesQuery.error.message);
  if (attachmentsQuery.error) throw error(500, attachmentsQuery.error.message);

  return {
    tasks: (tasksQuery.data ?? []).map((row) => normalizeTask(row as TaskInstance)),
    notes: (notesQuery.data ?? []).map((row) => {
      const noteRow = row as Record<string, unknown>;
      const document = (noteRow.notes_documents ?? {}) as Record<string, unknown>;
      return {
        id: String(document.id ?? ''),
        title: String(document.title ?? 'Untitled'),
        snippet: String(noteRow.text ?? '').slice(0, 120),
        kind: document.kind === 'one-time' ? 'one-time' : 'note'
      };
    }),
    attachments: (attachmentsQuery.data ?? []) as SearchResults['attachments']
  };
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
    return (
      Number((left.day_name ?? left.preferred_day) === null) -
        Number((right.day_name ?? right.preferred_day) === null) ||
      Number((left.week_key ?? left.preferred_week) === null) -
        Number((right.week_key ?? right.preferred_week) === null) ||
      getTaskHours(right) - getTaskHours(left) ||
      left.title_snapshot.localeCompare(right.title_snapshot)
    );
  });
}

function slotMatchesTask(slot: Slot, task: TaskInstance): boolean {
  const targetDay = task.day_name ?? task.preferred_day;
  if (targetDay && slot.dayName !== targetDay) return false;
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

export async function resetScheduleForMonth(monthKeyInput: string): Promise<{
  removedBlocks: number;
  lockedBlocksKept: number;
}> {
  const monthKey = normalizeMonthKey(monthKeyInput);

  const blocks = await listScheduleBlocksForMonth(monthKey);
  const unlockedBlocks = blocks.filter((block) => !block.locked);
  const lockedBlocksKept = blocks.filter((block) => block.locked).length;

  if (unlockedBlocks.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('schedule_blocks')
      .delete()
      .eq('month_key', monthKey)
      .eq('locked', false);

    if (deleteError) throw error(500, deleteError.message);
  }

  return {
    removedBlocks: unlockedBlocks.length,
    lockedBlocksKept
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

export async function saveNoteBlocks(
  documentId: string,
  blocks: PlannerBlock[]
): Promise<Pick<NotesViewData, 'tags' | 'noteTags'> | null> {
  const normalizedBlocks = toNoteBlockPayload(normalizeBlocks(blocks));
  const normalizedPlannerBlocks = normalizeBlocks(blocks);

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

  const wordCount = normalizedPlannerBlocks
    .map((block) => plainText(block.text ?? ''))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;

  const tagData = await syncNoteTags(documentId, normalizedPlannerBlocks);

  await createNoteVersionSnapshot(documentId, normalizedPlannerBlocks);

  const { error: docUpdateError } = await supabaseAdmin
    .from('notes_documents')
    .update({ updated_at: new Date().toISOString(), word_count: wordCount })
    .eq('id', documentId);

  if (docUpdateError) {
    throw error(500, docUpdateError.message);
  }

  return tagData;
}

export function createStarterBlocks(kind: DocumentKind = 'note'): PlannerBlock[] {
  return [createBlock(kind === 'one-time' ? 'checklist' : 'paragraph')];
}

export async function syncTemplateHoursDefault(templateId: string, hoursNeeded: number | null): Promise<void> {
  const { error: updateError } = await supabaseAdmin
    .from('task_instances')
    .update({ hours_needed: hoursNeeded })
    .eq('template_id', templateId)
    .is('archived_at', null);

  if (updateError) {
    throw error(500, updateError.message);
  }
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

function getWeekKeyForPreferredWeek(monthKey: string | null, preferredWeek: number | null): string | null {
  if (!monthKey || preferredWeek === null) return null;
  const targetWeek = getBoardWeeksForMonth(monthKey).find((week) => week.index === preferredWeek);
  return targetWeek?.weekKey ?? null;
}

export async function syncTemplatePlanningDefaults(input: {
  templateId: string;
  previousPreferredDay: DayName | null;
  nextPreferredDay: DayName | null;
  previousPreferredWeekOfMonth: number | null;
  nextPreferredWeekOfMonth: number | null;
}): Promise<void> {
  const { data, error: queryError } = await supabaseAdmin
    .from('task_instances')
    .select('*')
    .eq('template_id', input.templateId)
    .is('archived_at', null);

  if (queryError) {
    throw error(500, queryError.message);
  }

  const instances = (data ?? []).map((row) => normalizeTask(row as TaskInstance));

  for (const instance of instances) {
    const updates: Record<string, unknown> = {};

    if (
      instance.day_name === null ||
      instance.day_name === input.previousPreferredDay
    ) {
      updates.day_name = input.nextPreferredDay;
    }

    if (instance.preferred_day !== input.nextPreferredDay) {
      updates.preferred_day = input.nextPreferredDay;
    }

    if (instance.instance_kind === 'monthly') {
      const shouldSyncWeek =
        instance.week_of_month === null ||
        instance.week_of_month === input.previousPreferredWeekOfMonth;

      if (shouldSyncWeek) {
        updates.week_of_month = input.nextPreferredWeekOfMonth;
        updates.preferred_week = input.nextPreferredWeekOfMonth;
        updates.week_key = getWeekKeyForPreferredWeek(instance.month_key, input.nextPreferredWeekOfMonth);
      } else if (instance.preferred_week !== input.nextPreferredWeekOfMonth) {
        updates.preferred_week = input.nextPreferredWeekOfMonth;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('task_instances')
      .update(updates)
      .eq('id', instance.id);

    if (updateError) {
      throw error(500, updateError.message);
    }
  }
}

export function inferWeekIndex(weekKey: string | null, monthKey: string | null): number | null {
  if (!weekKey || !monthKey) return null;
  return getWeekIndexForMonth(weekKey, monthKey);
}
