import type { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/server/env';
import {
  clearSessionCookie,
  errorResponse,
  isCrossSiteMutation,
  readSessionId,
  relay,
  unauthorized,
  unavailable,
  upstreamFetch,
} from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Only resource routes are proxied generically. Auth and session routes have dedicated
 * handlers (under /api/auth) because their responses carry the session ID, which must
 * never reach the browser.
 */
const PROXIED_PATH = /^users(\/[A-Za-z0-9-]+)?$/;

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { path } = await params;
  const joined = path.join('/');
  if (!PROXIED_PATH.test(joined)) return errorResponse(404, 'NOT_FOUND', 'Not found');
  if (isCrossSiteMutation(request)) {
    return errorResponse(403, 'FORBIDDEN', 'Cross-site request rejected');
  }

  const sessionId = readSessionId(request);
  if (!sessionId) return unauthorized();

  const env = getServerEnv();
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await upstreamFetch(
      `/${joined}${request.nextUrl.search}`,
      {
        method: request.method,
        sessionId,
        body: hasBody ? await request.text() : undefined,
        contentType: request.headers.get('content-type'),
      },
      env,
    );
  } catch {
    return unavailable();
  }

  const response = await relay(upstream);
  // The API rejected the session (expired, terminated, user deleted): drop the dead cookie.
  if (upstream.status === 401) clearSessionCookie(response, env);
  return response;
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST };
