import { type NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/server/env';
import { clearSessionCookie } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const ALLOWED_TARGETS = new Set(['/sign-in', '/sign-up']);

/**
 * Server components cannot modify cookies, so when one finds the session cookie stale it
 * redirects here: the dead cookie is removed and the user continues to an auth page.
 * Without this, middleware (cookie present → /dashboard) and the dashboard (session
 * invalid → /sign-in) would redirect in a loop.
 */
export function GET(request: NextRequest): NextResponse {
  const next = request.nextUrl.searchParams.get('next') ?? '/sign-in';
  const target = ALLOWED_TARGETS.has(next) ? next : '/sign-in';
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  clearSessionCookie(response, getServerEnv());
  return response;
}
