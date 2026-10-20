import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerEnv } from '@/lib/server/env';
import {
  clearSessionCookie,
  errorResponse,
  isCrossSiteMutation,
  readSessionId,
  upstreamFetch,
} from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Terminates the session in the API, then clears the cookie. The cookie is cleared even if
 * the API call fails, so the browser is always signed out locally.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteMutation(request)) {
    return errorResponse(403, 'FORBIDDEN', 'Cross-site request rejected');
  }
  const env = getServerEnv();
  const sessionId = readSessionId(request);
  if (sessionId && z.uuid().safeParse(sessionId).success) {
    try {
      await upstreamFetch(`/sessions/${sessionId}`, { method: 'DELETE', sessionId }, env);
    } catch (error) {
      console.warn('Sign-out: could not terminate the session in the API', error);
    }
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response, env);
  return response;
}
