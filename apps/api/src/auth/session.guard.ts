import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_HEADER } from '@um/shared';
import { z } from 'zod';
import { ApiException } from '../common/api-exception';
import type { AuthenticatedRequest } from './auth-context';
import { ALLOW_ENDED_SESSION_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { SessionsService } from './sessions.service';

const SessionIdSchema = z.uuid();

/**
 * Global guard: every route requires a valid `X-Session-Id` unless marked `@Public()`.
 * Missing, malformed, unknown, terminated and expired sessions all get the same 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers[SESSION_HEADER];
    const parsed = SessionIdSchema.safeParse(header);
    if (!parsed.success) throw unauthorized();

    const allowEnded =
      this.reflector.getAllAndOverride<boolean>(ALLOW_ENDED_SESSION_KEY, targets) ?? false;
    const auth = await this.sessions.resolve(parsed.data, { allowEnded });
    if (!auth) throw unauthorized();

    request.auth = auth;
    return true;
  }
}

function unauthorized(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'UNAUTHORIZED',
    'A valid session is required (X-Session-Id header)',
  );
}
