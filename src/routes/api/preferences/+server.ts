import { error, json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

type PreferenceEntry = {
  key: string;
  value: unknown;
  updatedAt?: string | null;
};

function normalizeEntries(input: unknown): PreferenceEntry[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw error(400, 'Body must be an object');
  }

  const parsed = input as Record<string, unknown>;
  const entriesSource = Array.isArray(parsed.entries)
    ? parsed.entries
    : 'key' in parsed
      ? [parsed]
      : null;

  if (!entriesSource || entriesSource.length === 0) {
    throw error(400, 'entries are required');
  }

  return entriesSource.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw error(400, 'Invalid preference entry');
    }

    const record = entry as Record<string, unknown>;
    if (typeof record.key !== 'string' || !record.key.trim()) {
      throw error(400, 'Preference key is required');
    }

    return {
      key: record.key,
      value: record.value,
      updatedAt:
        typeof record.updatedAt === 'string' && record.updatedAt
          ? record.updatedAt
          : null
    };
  });
}

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const keys = url.searchParams
    .get('keys')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const singleKey = url.searchParams.get('key')?.trim();
  const requestedKeys = singleKey ? [singleKey] : keys;

  if (requestedKeys.length === 0) {
    throw error(400, 'key or keys is required');
  }

  const query =
    requestedKeys.length === 1
      ? supabaseAdmin.from('user_preferences').select('key, value').eq('key', requestedKeys[0]).maybeSingle()
      : supabaseAdmin.from('user_preferences').select('key, value').in('key', requestedKeys);

  const { data, error: queryError } = await query;
  if (queryError) throw error(500, queryError.message);

  const entries = Array.isArray(data) ? data : data ? [data] : [];
  return json({ entries });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireAuth(request);
  if (authError) return authError;

  const entries = normalizeEntries(await request.json().catch(() => null));
  const rows = entries.map((entry) => {
    const updatedAt = entry.updatedAt ?? new Date().toISOString();
    return {
      key: entry.key,
      value: entry.value,
      updated_at: updatedAt
    };
  });

  const { error: upsertError } = await supabaseAdmin
    .from('user_preferences')
    .upsert(rows.length === 1 ? rows[0] : rows, { onConflict: 'key' });

  if (upsertError) throw error(500, upsertError.message);

  return json({ success: true });
};
