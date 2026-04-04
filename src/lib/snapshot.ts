import { supabase } from './supabase';
import { takeSnapshotWithClient } from './snapshotCore';

/**
 * Captures a snapshot of tasks (and planner notes for weekly) before resetting.
 * Uses upsert so re-running is safe.
 */
export async function takeSnapshot(
  type: 'weekly' | 'monthly',
  periodKey?: string
): Promise<void> {
  await takeSnapshotWithClient(supabase, type, periodKey);
}
