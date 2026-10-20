import type { User } from '@um/shared';

/**
 * What the BFF auth routes return to the browser. Unlike the API's `{ id, user }`, the
 * session ID is never included: it only travels in the HttpOnly cookie.
 */
export interface BffAuthResponse {
  user: User;
}
