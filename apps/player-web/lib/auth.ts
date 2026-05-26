'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlayerAuthMeResponse, PlayerLoginResponse } from '@admin/schemas';
import { apiBaseUrl, clearStoredToken, fetchPlayerApi, getStoredToken, setStoredToken } from './api';

export type PlayerSession = PlayerAuthMeResponse;

export async function loginPlayer(email: string, password: string): Promise<PlayerLoginResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/player-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    credentials: 'omit',
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!data || typeof data !== 'object' || !('token' in data)) {
    throw new Error('Bad response');
  }
  const token = (data as { token: unknown }).token;
  if (typeof token !== 'string') throw new Error('Bad response');
  setStoredToken(token);
  return data as PlayerLoginResponse;
}

export async function logoutPlayer(): Promise<void> {
  try {
    await fetchPlayerApi('/api/player-auth/logout', { method: 'POST' });
  } catch {
    // even if upstream fails, drop the token so the user lands on /login
  }
  clearStoredToken();
}

/**
 * Hook that ensures the user is logged in. While auth check is in flight
 * returns `status: 'loading'`. If no token, kicks to /login and returns
 * `'loading'` forever (UI shows nothing). If token is good, returns
 * `'ready'` with the resolved session.
 */
export function usePlayerSession(): {
  status: 'loading' | 'ready';
  session: PlayerSession | null;
} {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' | 'ready'; session: PlayerSession | null }>(
    {
      status: 'loading',
      session: null,
    },
  );

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    fetchPlayerApi<PlayerSession>('/api/player-auth/me')
      .then((session) => {
        if (cancelled) return;
        setState({ status: 'ready', session });
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredToken();
        router.replace('/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return state;
}
