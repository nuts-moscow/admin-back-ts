import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PlayerAuthMeResponse } from '@admin/schemas';
import { PLAYER_TOKEN_COOKIE, PlayerApiError, fetchPlayerApi } from './api';

export type PlayerSession = PlayerAuthMeResponse;

/**
 * Returns the current player session, or null if no/invalid token.
 * Use in RSC layouts/pages. Does not redirect.
 */
export async function getPlayerSession(): Promise<PlayerSession | null> {
  const store = await cookies();
  const token = store.get(PLAYER_TOKEN_COOKIE)?.value ?? null;
  if (!token) return null;
  try {
    return await fetchPlayerApi<PlayerSession>('/api/player-auth/me', { token });
  } catch (err) {
    if (err instanceof PlayerApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * Returns the session or redirects to /login. Use in auth-guarded layouts.
 */
export async function requirePlayerSession(): Promise<PlayerSession> {
  const session = await getPlayerSession();
  if (!session) redirect('/login');
  return session;
}
