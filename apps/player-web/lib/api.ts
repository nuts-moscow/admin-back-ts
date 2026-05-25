import { cookies } from 'next/headers';

export const PLAYER_TOKEN_COOKIE = 'nuts_player_token';

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005').replace(/\/$/, '');
}

export interface PlayerApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Pass a token explicitly when calling from a route handler or middleware. */
  token?: string | null;
  /** Throw on non-2xx instead of returning the raw Response. Default true. */
  throwOnError?: boolean;
  signal?: AbortSignal;
  cache?: RequestCache;
}

async function readTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLAYER_TOKEN_COOKIE)?.value ?? null;
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

/**
 * Server-side fetch helper for the player API.
 * Reads bearer token from the httpOnly cookie unless one is passed in.
 * Use from RSC, route handlers, and middleware. Not for client components.
 */
export async function fetchPlayerApi<T = unknown>(
  path: string,
  opts: PlayerApiOptions = {}
): Promise<T> {
  const method = opts.method ?? 'GET';
  const token = opts.token === undefined ? await readTokenFromCookies() : opts.token;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? 'no-store',
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text.length > 0 ? safeJson(text) : undefined;

  if (!res.ok) {
    const msg = typeof data === 'object' && data && 'error' in data
      ? String((data as { error: unknown }).error)
      : `HTTP ${res.status}`;
    if (opts.throwOnError === false) {
      return data as T;
    }
    throw new PlayerApiError(res.status, data, msg);
  }

  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
