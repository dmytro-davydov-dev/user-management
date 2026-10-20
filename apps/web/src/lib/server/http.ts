import 'server-only';
import type { ApiError, ErrorCode } from '@um/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../session-cookie';
import { getServerEnv, type WebEnv } from './env';

/** JSON error in the shared `{ code, message }` shape. */
export function errorResponse(status: number, code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ code, message } satisfies ApiError, { status });
}

export const unauthorized = (): NextResponse =>
  errorResponse(401, 'UNAUTHORIZED', 'A valid session is required');

export const unavailable = (): NextResponse =>
  errorResponse(503, 'SERVICE_UNAVAILABLE', 'The API is unavailable');

interface UpstreamInit {
  method: string;
  sessionId?: string | undefined;
  body?: ArrayBuffer | string | null | undefined;
  contentType?: string | null | undefined;
}

/**
 * Calls the API on the internal network. Browser headers (cookies included) are never
 * forwarded; the session travels only as `X-Session-Id`. Throws on network failure.
 */
export function upstreamFetch(path: string, init: UpstreamInit, env = getServerEnv()) {
  const headers = new Headers({ accept: 'application/json' });
  if (init.sessionId) headers.set('x-session-id', init.sessionId);
  if (init.body !== undefined && init.body !== null) {
    headers.set('content-type', init.contentType ?? 'application/json');
  }
  return fetch(new URL(path, env.API_INTERNAL_URL), {
    method: init.method,
    headers,
    body: init.body ?? null,
    cache: 'no-store',
    redirect: 'manual',
  });
}

export function sessionCookieOptions(env: WebEnv) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600,
  };
}

export function setSessionCookie(response: NextResponse, sessionId: string, env: WebEnv): void {
  response.cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions(env));
}

export function clearSessionCookie(response: NextResponse, env: WebEnv): void {
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(env), maxAge: 0 });
}

export function readSessionId(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value || undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense in depth on top of SameSite=Lax: reject state-changing requests that a browser
 * marks as cross-site, or whose Origin does not match the host serving the app.
 */
export function isCrossSiteMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Copies an upstream response (status, JSON body, content type) into a NextResponse. */
export async function relay(upstream: Response): Promise<NextResponse> {
  const body =
    upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (body && contentType) headers.set('content-type', contentType);
  return new NextResponse(body, { status: upstream.status, headers });
}
