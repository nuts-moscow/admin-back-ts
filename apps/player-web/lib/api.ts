/**
 * Client-side API helpers. The browser talks directly to the backend —
 * no Next.js proxy layer. Token lives in localStorage and is sent as
 * `Authorization: Bearer ...` on every call.
 *
 * Trade-off vs httpOnly cookie: token is reachable from JS, so XSS would
 * steal it. Accepted for v1 in exchange for a much simpler deployment
 * (no Vercel function plumbing, no cross-origin cookie dance).
 */

export const PLAYER_TOKEN_KEY = 'nuts_player_token';

/** Production backend URL, baked into the bundle. Override locally with NEXT_PUBLIC_API_URL. */
const DEFAULT_API_URL = 'https://nuts.moscow/v2';

export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
  return url.replace(/\/$/, '');
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PLAYER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAYER_TOKEN_KEY, token);
  } catch {
    // localStorage disabled — caller should treat as logged-out next time
  }
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PLAYER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class PlayerApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface FetchPlayerApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Browser → backend fetch. On 401 clears the token and throws — caller
 * is expected to redirect to /login (the AuthGate in (app)/layout does this).
 */
export async function fetchPlayerApi<T = unknown>(
  path: string,
  opts: FetchPlayerApiOptions = {},
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: 'omit',
  });

  if (res.status === 401) {
    clearStoredToken();
    throw new PlayerApiError(401, null, 'Unauthorized');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown;
  try {
    data = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new PlayerApiError(res.status, data, msg);
  }
  return data as T;
}
