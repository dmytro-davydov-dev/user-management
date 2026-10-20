import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from './auth-context';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ALLOW_ENDED_SESSION_KEY = 'auth:allowEndedSession';

/** Opts a route out of the global SessionGuard. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * The route still requires an existing session for an existing user, but accepts one that is
 * already terminated or expired. Used by `DELETE /sessions/:id` so sign-out is idempotent.
 */
export const AllowEndedSession = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_ENDED_SESSION_KEY, true);

/** Injects the `AuthContext` attached by SessionGuard. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a route without SessionGuard authentication');
  return auth satisfies AuthContext;
});
