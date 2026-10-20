import type { AuthResponse } from '@um/shared';
import { toPublicUser } from '../users/user.mapper';
import type { AuthContext } from './auth-context';

/** `id` is the session identifier the client sends back as `X-Session-Id`. */
export function toAuthResponse({ session, user }: AuthContext): AuthResponse {
  return { id: session.id, user: toPublicUser(user) };
}
