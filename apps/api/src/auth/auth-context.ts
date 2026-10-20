import type { Session } from '@um/shared';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import type { PublicUserRecord } from '../users/user.mapper';

export const sessionSelect = {
  id: true,
  userId: true,
  createdAt: true,
  terminatedAt: true,
  expiresAt: true,
} as const satisfies Prisma.SessionSelect;

export type SessionRecord = Prisma.SessionGetPayload<{ select: typeof sessionSelect }>;

/** What SessionGuard attaches to the request after validating `X-Session-Id`. */
export interface AuthContext {
  session: SessionRecord;
  user: PublicUserRecord;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/** A session authenticates only while it is neither terminated nor expired. */
export function isSessionActive(
  session: Pick<SessionRecord, 'terminatedAt' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return session.terminatedAt === null && session.expiresAt.getTime() > now.getTime();
}

export function toPublicSession(record: SessionRecord): Session {
  return {
    id: record.id,
    userId: record.userId,
    createdAt: record.createdAt.toISOString(),
    terminatedAt: record.terminatedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt.toISOString(),
  };
}
