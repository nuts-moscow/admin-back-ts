'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlayerAuthMeResponse, PlayerLoginResponse } from '@admin/schemas';
import { apiBaseUrl, clearStoredToken, fetchPlayerApi, getStoredToken, setStoredToken } from './api';
import { REQUIRED_CONSENTS } from '@/data/legal';

export type PlayerSession = PlayerAuthMeResponse;

/** POSTs a public auth endpoint and surfaces the backend's own error text. */
async function postPublic(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  return data;
}

/** Same, but the response is expected to carry a session grant. */
async function postForSession(
  path: string,
  body: Record<string, unknown>,
): Promise<PlayerLoginResponse> {
  const data = await postPublic(path, body);
  if (!data || typeof data !== 'object' || !('token' in data)) {
    throw new Error('Bad response');
  }
  const token = (data as { token: unknown }).token;
  if (typeof token !== 'string') throw new Error('Bad response');
  setStoredToken(token);
  return data as PlayerLoginResponse;
}

/** Signing in: the identifier is an address, or a legacy login. */
export function loginPlayer(login: string, password: string): Promise<PlayerLoginResponse> {
  return postForSession('/api/player-auth/login', { login: login.trim(), password });
}

/**
 * Signup step one. Nothing exists after this call — the address is claimed
 * and a code is on its way to it.
 */
export function beginSignup(email: string, password: string): Promise<void> {
  return postPublic('/api/player-auth/signup/begin', {
    email: email.trim(),
    password,
  }).then(() => undefined);
}

/** Signup step two: the code proves the address and the account appears. */
export function completeSignup(
  email: string,
  code: string,
  nickname: string,
  password: string,
): Promise<PlayerLoginResponse> {
  return postForSession('/api/player-auth/signup/complete', {
    email: email.trim(),
    code: code.trim(),
    nickname: nickname.trim(),
    password,
    consents: REQUIRED_CONSENTS,
  });
}

export interface NicknameAvailability {
  available: boolean;
  error?: string;
}

/**
 * The advisory check behind the nickname field. It goes through the same rule
 * the write uses, so the answer shown while typing and the answer on submit
 * cannot differ for a different reason — only because someone else got there
 * in between, which the backend still refuses without spending the code.
 */
export async function checkNickname(
  nickname: string,
  signal?: AbortSignal,
): Promise<NicknameAvailability> {
  const res = await fetch(
    `${apiBaseUrl()}/api/player-auth/nickname-available?nickname=${encodeURIComponent(nickname.trim())}`,
    { signal, credentials: 'omit' },
  );
  if (!res.ok) return { available: true };
  return (await res.json()) as NicknameAvailability;
}

/**
 * Asks for a reset code. Answers the same whether or not the address is
 * known, so the UI must not claim the account exists.
 */
export function requestPasswordReset(email: string): Promise<void> {
  return postPublic('/api/player-auth/password/reset-request', {
    email: email.trim(),
  }).then(() => undefined);
}

/** Sets a new password with a code from the mailbox. Retires every grant. */
export function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return postPublic('/api/player-auth/password/reset', {
    email: email.trim(),
    code: code.trim(),
    newPassword,
  }).then(() => undefined);
}

/** Ends the player's own sessions: this grant, or all of them. */
export async function endSessions(scope: 'current' | 'all'): Promise<void> {
  // fetchPlayerApi sets the content type and serialises the body itself.
  await fetchPlayerApi('/api/player-auth/sessions/end', {
    method: 'POST',
    body: { scope },
  });
  clearStoredToken();
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
