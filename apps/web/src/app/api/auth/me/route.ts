import { MeResponseSchema } from '@um/shared';
import { type NextRequest, NextResponse } from 'next/server';
import type { BffAuthResponse } from '@/lib/bff-types';
import { getServerEnv } from '@/lib/server/env';
import {
  clearSessionCookie,
  errorResponse,
  readSessionId,
  relay,
  unauthorized,
  unavailable,
  upstreamFetch,
} from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Current user only; the session object (which contains its ID) is stripped. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = readSessionId(request);
  if (!sessionId) return unauthorized();
  const env = getServerEnv();
  let upstream: Response;
  try {
    upstream = await upstreamFetch('/auth/me', { method: 'GET', sessionId }, env);
  } catch {
    return unavailable();
  }
  if (!upstream.ok) {
    const response = await relay(upstream);
    if (upstream.status === 401) clearSessionCookie(response, env);
    return response;
  }
  const parsed = MeResponseSchema.safeParse(await upstream.json().catch(() => undefined));
  if (!parsed.success) {
    return errorResponse(502, 'INTERNAL_ERROR', 'Unexpected response from the API');
  }
  return NextResponse.json({ user: parsed.data.user } satisfies BffAuthResponse);
}
