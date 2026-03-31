export type TaskType = 'weekly' | 'monthly' | 'random';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  completed: boolean;
  notes: string;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  filename: string;
  original_name: string | null;
  mime_type: string | null;
  url: string | null;
  week_key: string | null;
  created_at: string;
}

export interface WeeklyPlan {
  id: string;
  week_key: string;
  day: string;
  content: string;
}

export interface ScheduleBlock {
  id: string;
  week_key: string;
  day: string;
  start_time: string;
  end_time: string;
  task_title: string;
  notes: string;
  sort_order: number;
}

export interface HistorySnapshot {
  id: string;
  period_type: 'weekly' | 'monthly';
  period_key: string;
  period_label: string;
  completed_tasks: Task[];
  missed_tasks: Task[];
  planner_notes: Record<string, string>;
  completion_rate: number;
  created_at: string;
}
