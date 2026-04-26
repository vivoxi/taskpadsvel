import { browser } from '$app/environment';
import { syncState } from '$lib/stores';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildHeaders(input?: HeadersInit): Headers {
  return new Headers(input);
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
      headers,
      credentials: 'same-origin'
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
