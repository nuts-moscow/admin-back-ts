import { NextResponse } from 'next/server';
import { PLAYER_TOKEN_COOKIE, apiBaseUrl } from '@/lib/api';

const TOKEN_MAX_AGE_SEC = 60 * 60 * 24; // 24h — matches PLAYER_JWT_ACCESS_TTL_SEC

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const upstream = await fetch(`${apiBaseUrl()}/api/player-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await upstream.text();
  let data: unknown;
  try {
    data = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    return NextResponse.json(
      data ?? { error: `HTTP ${upstream.status}` },
      { status: upstream.status },
    );
  }
  if (!data || typeof data !== 'object' || !('token' in data)) {
    return NextResponse.json({ error: 'Bad upstream response' }, { status: 502 });
  }

  const token = (data as { token: unknown }).token;
  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'Bad upstream response' }, { status: 502 });
  }

  const res = NextResponse.json(data);
  res.cookies.set({
    name: PLAYER_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_MAX_AGE_SEC,
  });
  return res;
}
