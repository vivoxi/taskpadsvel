import { error } from '@sveltejs/kit';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const WEEK_KEY_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MIN_TASK_HOURS = 0.25;
export const MAX_TASK_HOURS = 24;
export const MAX_UPLOAD_FILE_NAME_LENGTH = 180;

export function assertMonthKey(value: unknown, field = 'monthKey'): string {
  if (typeof value !== 'string' || !MONTH_KEY_RE.test(value)) {
    throw error(400, `${field} must be in YYYY-MM format`);
  }
  return value;
}

export function assertWeekKey(value: unknown, field = 'weekKey'): string {
  if (typeof value !== 'string' || !WEEK_KEY_RE.test(value)) {
    throw error(400, `${field} must be in YYYY-W## format`);
  }
  return value;
}

export function parseNullableIsoDate(value: unknown, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw error(400, `${field} must be a date string or null`);
  }
  return value;
}

export function parseNullableIsoDateTime(value: unknown, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw error(400, `${field} must be an ISO datetime string or null`);
  }
  return value;
}

export function parseNullableHours(value: unknown, field = 'hours_needed'): number | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw error(400, `${field} must be a number or null`);
  }
  if (value < MIN_TASK_HOURS || value > MAX_TASK_HOURS) {
    throw error(400, `${field} must be between ${MIN_TASK_HOURS} and ${MAX_TASK_HOURS}`);
  }
  return value;
}

export function validateUploadFileNameLength(fileName: string): string {
  if (fileName.trim().length === 0) {
    throw error(400, 'file name is required');
  }
  if (fileName.length > MAX_UPLOAD_FILE_NAME_LENGTH) {
    throw error(400, `file name cannot exceed ${MAX_UPLOAD_FILE_NAME_LENGTH} characters`);
  }
  return fileName;
}
