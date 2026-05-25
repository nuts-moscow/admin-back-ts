import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PLAYER_TOKEN_COOKIE, apiBaseUrl } from '@/lib/api';

/**
 * Generic mutating-call proxy for client components.
 *
 * Client components can't read the httpOnly cookie, so when they need to call a
 * player-API endpoint (e.g. POST /api/player/tournaments/:id/register) they go through
 * /api/player-proxy/<same path with the /api/player prefix dropped>.
 *
 * Read endpoints are normally fetched server-side and don't go through this proxy.
 */
async function proxy(req: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const store = await cookies();
  const token = store.get(PLAYER_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const upstream = `${apiBaseUrl()}/api/player/${path.join('/')}${url.search}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const ct = req.headers.get('content-type');
  if (ct) headers['Content-Type'] = ct;

  const init: RequestInit = {
    method: req.method,
    headers,
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }
  const upstreamRes = await fetch(upstream, init);
  const body = await upstreamRes.text();
  return new NextResponse(body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
