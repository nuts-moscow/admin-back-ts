import { NextResponse, type NextRequest } from 'next/server';
import { PLAYER_TOKEN_COOKIE } from '@/lib/api';

/**
 * Redirects unauthenticated users to /login.
 * Token presence is the only thing checked here — actual validity is verified
 * by RSC pages via `requirePlayerSession()` (which hits /api/player-auth/me).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = req.cookies.has(PLAYER_TOKEN_COOKIE);

  if (pathname === '/login') {
    if (hasToken) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (!hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /api/* (Next route handlers handle their own auth)
     * - /_next/static, /_next/image (assets)
     * - /favicon.ico, /assets/*
     */
    '/((?!api|_next/static|_next/image|favicon.ico|assets).*)',
  ],
};
