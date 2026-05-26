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

  const upstreamUrl = `${apiBaseUrl()}/api/player-auth/login`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    // Surface the real fetch failure (connection refused, DNS, TLS, etc.) so
    // we get a useful message in Vercel function logs instead of a bare 500.
    console.error('[login] upstream fetch failed', {
      upstreamUrl,
      hasApiUrlEnv: Boolean(process.env.NEXT_PUBLIC_API_URL),
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
    return NextResponse.json(
      {
        error: 'Backend unreachable',
        detail: err instanceof Error ? err.message : String(err),
        upstreamUrl,
      },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let data: unknown;
  try {
    data = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    console.warn('[login] upstream non-2xx', {
      upstreamUrl,
      status: upstream.status,
      body: text.slice(0, 500),
    });
    return NextResponse.json(
      data ?? { error: `HTTP ${upstream.status}` },
      { status: upstream.status },
    );
  }
  if (!data || typeof data !== 'object' || !('token' in data)) {
    console.error('[login] upstream returned bad body', { upstreamUrl, body: text.slice(0, 500) });
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
