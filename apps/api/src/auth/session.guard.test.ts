import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from '../common/api-exception';
import { type AuthContext, isSessionActive } from './auth-context';
import { ALLOW_ENDED_SESSION_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { SessionGuard } from './session.guard';
import type { SessionsService } from './sessions.service';

const HOUR = 3_600_000;

function contextFor(headers: Record<string, unknown>, metadata: Record<string, boolean> = {}) {
  const request: { headers: Record<string, unknown>; auth?: AuthContext } = { headers };
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function guardWith(resolved: AuthContext | null) {
  const resolve = vi.fn<SessionsService['resolve']>().mockResolvedValue(resolved);
  const guard = new SessionGuard(new Reflector(), { resolve } as unknown as SessionsService);
  return { guard, resolve };
}

async function rejection(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
  }
  throw new Error('expected an ApiException');
}

const auth = { session: { id: randomUUID() }, user: { id: randomUUID() } } as AuthContext;

describe('SessionGuard (U4)', () => {
  it('rejects a missing header with 401 without querying sessions', async () => {
    const { guard, resolve } = guardWith(auth);
    const error = await rejection(guard.canActivate(contextFor({}).context));
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['not-a-uuid', '', ['a', 'b']])(
    'rejects a malformed header %j with 401',
    async (value) => {
      const { guard, resolve } = guardWith(auth);
      const error = await rejection(
        guard.canActivate(contextFor({ 'x-session-id': value }).context),
      );
      expect(error.getStatus()).toBe(401);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown, terminated or expired session (resolve → null) with 401', async () => {
    const { guard } = guardWith(null);
    const error = await rejection(
      guard.canActivate(contextFor({ 'x-session-id': randomUUID() }).context),
    );
    expect(error.getStatus()).toBe(401);
  });

  it('attaches the auth context for a valid session', async () => {
    const { guard, resolve } = guardWith(auth);
    const id = randomUUID();
    const { context, request } = contextFor({ 'x-session-id': id });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toBe(auth);
    expect(resolve).toHaveBeenCalledWith(id, { allowEnded: false });
  });

  it('skips authentication on @Public() routes', async () => {
    const { guard, resolve } = guardWith(null);
    const { context } = contextFor({}, { [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('passes allowEnded for @AllowEndedSession() routes', async () => {
    const { guard, resolve } = guardWith(auth);
    const { context } = contextFor(
      { 'x-session-id': randomUUID() },
      { [ALLOW_ENDED_SESSION_KEY]: true },
    );
    await guard.canActivate(context);
    expect(resolve).toHaveBeenCalledWith(expect.any(String), { allowEnded: true });
  });
});

describe('isSessionActive', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const future = new Date(now.getTime() + HOUR);

  it('is true for an open, unexpired session', () => {
    expect(isSessionActive({ terminatedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it('is false once terminated', () => {
    expect(isSessionActive({ terminatedAt: now, expiresAt: future }, now)).toBe(false);
  });

  it('is false at or after expiry', () => {
    expect(isSessionActive({ terminatedAt: null, expiresAt: now }, now)).toBe(false);
    expect(
      isSessionActive({ terminatedAt: null, expiresAt: new Date(now.getTime() - 1) }, now),
    ).toBe(false);
  });
});
