import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PLAYER_TOKEN_COOKIE, apiBaseUrl } from '@/lib/api';

export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(PLAYER_TOKEN_COOKIE)?.value;
  if (token) {
    // Fire-and-forget: even if upstream blocklist fails, we still clear the cookie.
    await fetch(`${apiBaseUrl()}/api/player-auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: PLAYER_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
