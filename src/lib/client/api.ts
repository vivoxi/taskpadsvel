import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { authPassword, syncState } from '$lib/stores';

export const clientAuthRequired = env.PUBLIC_AUTH_REQUIRED === 'true';

/**
 * Set to true by the layout once the server confirms the user is authenticated
 * (via session cookie). Used by canUseClientApi so cookie-auth users are not
 * incorrectly blocked from making API mutations.
 */
export const clientAuthenticated = writable(false);

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function canUseClientApi(password: string): boolean {
  return !clientAuthRequired || password.trim().length > 0 || get(clientAuthenticated);
}

function buildHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);
  const password = get(authPassword).trim();

  if (password) {
    headers.set('Authorization', `Bearer ${password}`);
  }

  return headers;
}

async function getErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    const message = payload?.error ?? payload?.message ?? '';
    if (message) return message;
  }

  return (await response.text().catch(() => '')).slice(0, 180);
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = buildHeaders(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  if (browser && isMutation) {
    syncState.set('saving');
  }

  let response: Response;

  try {
    response = await fetch(input, {
      ...init,
      headers
    });
  } catch (fetchError) {
    if (browser && isMutation) {
      syncState.set('offline');
    }
    throw fetchError;
  }

  if (!response.ok) {
    if (browser && isMutation) {
      syncState.set(response.status === 409 ? 'conflict' : navigator.onLine ? 'conflict' : 'offline');
    }
    throw new ApiError(
      (await getErrorMessage(response)) || `Request failed (${response.status})`,
      response.status
    );
  }

  if (browser && isMutation) {
    syncState.set('synced');
  }

  return response;
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(input, init);

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiSendJson<T>(
  input: RequestInfo | URL,
  method: string,
  body?: unknown
): Promise<T> {
  return apiJson<T>(input, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
