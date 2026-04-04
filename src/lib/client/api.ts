import { env } from '$env/dynamic/public';
import { get } from 'svelte/store';
import { authPassword } from '$lib/stores';

export const clientAuthRequired = env.PUBLIC_AUTH_REQUIRED === 'true';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function canUseClientApi(password: string): boolean {
  return !clientAuthRequired || password.trim().length > 0;
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

  if (env.PUBLIC_AUTH_REQUIRED === 'true' && !headers.has('Authorization')) {
    throw new ApiError('Admin password required', 401);
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new ApiError(
      (await getErrorMessage(response)) || `Request failed (${response.status})`,
      response.status
    );
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
