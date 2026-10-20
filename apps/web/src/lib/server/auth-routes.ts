import 'server-only';
import { AuthResponseSchema } from '@um/shared';
import { type NextRequest, NextResponse } from 'next/server';
import type { BffAuthResponse } from '../bff-types';
import { getServerEnv } from './env';
import {
  errorResponse,
  isCrossSiteMutation,
  relay,
  setSessionCookie,
  unavailable,
  upstreamFetch,
} from './http';

/**
 * Shared by sign-up and sign-in: forwards credentials to the API and, on success, moves the
 * returned session ID into the HttpOnly cookie. The browser receives `{ user }` only.
 */
export async function startSession(request: NextRequest, apiPath: string): Promise<NextResponse> {
  if (isCrossSiteMutation(request)) {
    return errorResponse(403, 'FORBIDDEN', 'Cross-site request rejected');
  }
  const env = getServerEnv();
  let upstream: Response;
  try {
    upstream = await upstreamFetch(
      apiPath,
      { method: 'POST', body: await request.text(), contentType: 'application/json' },
      env,
    );
  } catch {
    return unavailable();
  }
  if (!upstream.ok) return relay(upstream);

  const parsed = AuthResponseSchema.safeParse(await upstream.json().catch(() => undefined));
  if (!parsed.success) {
    return errorResponse(502, 'INTERNAL_ERROR', 'Unexpected response from the API');
  }
  const response = NextResponse.json({ user: parsed.data.user } satisfies BffAuthResponse, {
    status: upstream.status,
  });
  setSessionCookie(response, parsed.data.id, env);
  return response;
}
