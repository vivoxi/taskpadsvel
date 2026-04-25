export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export type DayName = (typeof DAY_NAMES)[number];
export type TaskTemplateKind = 'weekly' | 'monthly';
export type TaskInstanceStatus = 'open' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskSourceType = 'weekly' | 'monthly' | 'inbox';
export type SyncState = 'saving' | 'synced' | 'offline' | 'conflict';
export type BlockType =
  | 'heading'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'checklist'
  | 'todo'
  | 'bullet_list'
  | 'numbered_list'
  | 'code'
  | 'quote'
  | 'divider'
  | 'image'
  | 'file';
export type DocumentKind = 'note' | 'one-time';

export type PlannerBlock = {
  id: string;
  type: BlockType;
  text: string;
  checked: boolean | null;
  level: number | null;
};

export type TaskTemplate = {
  id: string;
  title: string;
  kind: TaskTemplateKind;
  active: boolean;
  estimate_hours: number | null;
  hours_needed_default: number | null;
  priority_default: TaskPriority;
  category: string | null;
  source_type_default: TaskSourceType;
  due_day_offset: number | null;
  preferred_day: DayName | null;
  preferred_week_of_month: number | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type TaskInstance = {
  id: string;
  template_id: string | null;
  title_snapshot: string;
  instance_kind: TaskTemplateKind;
  week_key: string | null;
  month_key: string | null;
  week_of_month: number | null;
  day_name: DayName | null;
  status: TaskInstanceStatus;
  completed_at: string | null;
  priority: TaskPriority;
  due_date: string | null;
  hours_needed: number | null;
  category: string | null;
  source_type: TaskSourceType;
  preferred_day: DayName | null;
  preferred_week: number | null;
  carried_from_instance_id: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  linked_schedule_block_id: string | null;
  sort_order: number | null;
  source_context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WeeklyNote = {
  id: string;
  week_key: string;
  day_name: DayName;
  blocks_json: PlannerBlock[];
  updated_at: string;
};

export type NoteCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
};

export type NotesDocument = {
  id: string;
  title: string;
  slug: string | null;
  kind: DocumentKind;
  category_id: string | null;
  starred: boolean;
  deleted_at: string | null;
  sort_order: number;
  cover_image_url: string | null;
  word_count: number;
  preview: string;
  attachment_count: number;
  first_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteBlock = {
  id: string;
  document_id: string;
  type: BlockType;
  text: string;
  checked: boolean | null;
  level: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaskAttachment = {
  id: string;
  task_instance_id: string | null;
  note_document_id: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  public_url: string | null;
  created_at: string;
};

export type PlannerSettings = {
  id: string;
  label: string;
  working_day_start: string;
  working_day_end: string;
  break_start: string;
  break_end: string;
  buffer_minutes: number;
  theme_mode: 'system' | 'light' | 'dark';
  created_at: string;
  updated_at: string;
};

export type ScheduleBlock = {
  id: string;
  task_instance_id: string | null;
  week_key: string | null;
  month_key: string | null;
  day_name: DayName | null;
  scheduled_for: string;
  starts_at: string;
  ends_at: string;
  duration_hours: number;
  locked: boolean;
  status: 'planned' | 'done' | 'skipped';
  source_type: TaskSourceType;
  title_snapshot: string;
  created_at: string;
  updated_at: string;
};

export type CapacitySnapshot = {
  available_hours: number;
  planned_hours: number;
  remaining_hours: number;
  overflow_hours: number;
  unassigned_hours: number;
};

export type ScheduleHealth = {
  block_count: number;
  locked_count: number;
  split_candidate_count: number;
  overflow_warning: string | null;
};

export type WeekDayView = {
  dayName: DayName;
  dateLabel: string;
  isoDate: string;
  blocks: PlannerBlock[];
};

export type WeekViewData = {
  weekKey: string;
  monthKey: string;
  label: string;
  isCurrentWeek: boolean;
  todayDayName: DayName | null;
  days: WeekDayView[];
  tasks: TaskInstance[];
  tasksByDay: TasksByDay;
  softAssignedTaskIds: string[];
  settings: PlannerSettings;
  capacity: CapacitySnapshot;
  schedule: ScheduleHealth;
};

export type TasksByDay = Partial<Record<DayName, TaskInstance[]>>;

export type SoftAssignment = {
  taskInstanceId: string;
  weekKey: string | null;
  dayName: DayName | null;
  scheduledFor: string;
  startsAt: string;
};

export type MonthWeekSlot = {
  index: number;
  weekKey: string;
  label: string;
  shortLabel: string;
};

export type MonthViewData = {
  monthKey: string;
  label: string;
  weeks: MonthWeekSlot[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
  softAssignments: Partial<Record<string, SoftAssignment>>;
  settings: PlannerSettings;
  capacity: CapacitySnapshot;
  schedule: ScheduleHealth;
};

export type NotesViewData = {
  selectedDocumentId: string;
  documents: NotesDocument[];
  blocks: PlannerBlock[];
  attachments: TaskAttachment[];
  categories: NoteCategory[];
};

export type OneTimeViewData = {
  selectedDocumentId: string;
  documents: NotesDocument[];
  blocks: PlannerBlock[];
};

export type HistoryViewData = {
  completedTasks: TaskInstance[];
  carriedTasks: TaskInstance[];
  archivedTasks: TaskInstance[];
  attachmentCount: number;
  summary: {
    completedCount: number;
    carriedCount: number;
    archivedCount: number;
  };
};

export type SearchNoteHit = {
  id: string;
  title: string;
  snippet: string;
  kind: DocumentKind;
};

export type SearchAttachmentHit = {
  id: string;
  file_name: string;
  task_instance_id: string | null;
};

export type SearchResults = {
  tasks: TaskInstance[];
  notes: SearchNoteHit[];
  attachments: SearchAttachmentHit[];
};
