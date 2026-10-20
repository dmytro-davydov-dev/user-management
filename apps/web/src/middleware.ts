import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/session-cookie';

const AUTH_PAGES = new Set(['/sign-in', '/sign-up']);

/**
 * Fast, optimistic routing on cookie presence only. The protected layout still confirms
 * the session with the API (`/auth/me`) before rendering anything.
 */
export function middleware(request: NextRequest): NextResponse {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (!hasSession && (pathname === '/dashboard' || pathname.startsWith('/dashboard/'))) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  if (hasSession && AUTH_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'],
};
