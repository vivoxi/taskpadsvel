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
export type BlockType = 'heading' | 'paragraph' | 'checklist';

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
  preferred_day: DayName | null;
  preferred_week_of_month: number | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type TaskInstance = {
  id: string;
  template_id: string;
  title_snapshot: string;
  instance_kind: TaskTemplateKind;
  week_key: string | null;
  month_key: string | null;
  week_of_month: number | null;
  day_name: DayName | null;
  status: TaskInstanceStatus;
  completed_at: string | null;
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

export type NotesDocument = {
  id: string;
  title: string;
  slug: string | null;
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
};

export type TasksByDay = Partial<Record<DayName, TaskInstance[]>>;

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
};

export type NotesViewData = {
  selectedDocumentId: string;
  documents: NotesDocument[];
  blocks: PlannerBlock[];
};
