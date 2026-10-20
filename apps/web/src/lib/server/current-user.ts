import 'server-only';
import { MeResponseSchema, type User } from '@um/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { SESSION_COOKIE } from '../session-cookie';
import { upstreamFetch } from './http';

export type CurrentAuth =
  | { status: 'authenticated'; user: User }
  /** A cookie exists but the API rejects the session (expired, terminated, user deleted). */
  | { status: 'expired' }
  | { status: 'anonymous' };

/**
 * Confirms the session with the API (`GET /auth/me`); cookie presence alone is never
 * trusted. Deduplicated per request. Throws if the API is unreachable (error boundary).
 */
export const getCurrentAuth = cache(async (): Promise<CurrentAuth> => {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) return { status: 'anonymous' };

  const response = await upstreamFetch('/auth/me', { method: 'GET', sessionId });
  if (response.status === 401) return { status: 'expired' };
  if (!response.ok) throw new Error(`GET /auth/me failed with ${response.status}`);
  const { user } = MeResponseSchema.parse(await response.json());
  return { status: 'authenticated', user };
});

/** URL that clears a stale session cookie, then continues to `next`. */
export const clearSessionUrl = (next: '/sign-in' | '/sign-up'): string =>
  `/api/auth/clear-session?next=${encodeURIComponent(next)}`;

/** For protected server components and layouts: returns the user or redirects. */
export async function requireUser(): Promise<User> {
  const auth = await getCurrentAuth();
  if (auth.status === 'authenticated') return auth.user;
  redirect(auth.status === 'expired' ? clearSessionUrl('/sign-in') : '/sign-in');
}
